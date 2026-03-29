## AIGC START
import argparse
import json
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Optional, Tuple

import requests


DEFAULT_HOST = "https://open.feishu.cn"
APP_ID = "cli_a93b962c09789cc7"
APP_SECRET = "hX82348cK55VZ8Mnas13MeMirmBCanoo"


def post_json(url: str, token: str, body: dict) -> dict:
    resp = requests.post(
        url,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"},
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        timeout=60,
    )
    payload = resp.json() if resp.headers.get("Content-Type", "").startswith("application/json") else {"raw": resp.text}
    if resp.status_code >= 400:
        raise RuntimeError(f"HTTP {resp.status_code} {url}\n{payload}")
    return payload


def get_json(url: str, token: str) -> dict:
    resp = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=60)
    payload = resp.json() if resp.headers.get("Content-Type", "").startswith("application/json") else {"raw": resp.text}
    if resp.status_code >= 400:
        raise RuntimeError(f"HTTP {resp.status_code} {url}\n{payload}")
    return payload


def get_tenant_access_token(host: str, app_id: str, app_secret: str) -> str:
    url = f"{host}/open-apis/auth/v3/tenant_access_token/internal"
    resp = requests.post(url, json={"app_id": app_id, "app_secret": app_secret}, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    if data.get("code") != 0:
        raise RuntimeError(f"get tenant_access_token failed: {data}")
    return data["tenant_access_token"]


def upload_file_to_drive(host: str, token: str, file_path: Path, *, parent_node: str = "") -> str:
    """
    上传到云空间（可见文件），用于 import_tasks 的源文件。
    """
    size = file_path.stat().st_size
    url = f"{host}/open-apis/drive/v1/files/upload_all"
    headers = {"Authorization": f"Bearer {token}"}
    files = {"file": (file_path.name, file_path.read_bytes())}
    data = {
        "file_name": file_path.name,
        "parent_type": "explorer",
        "parent_node": parent_node,
        "size": str(size),
    }
    resp = requests.post(url, headers=headers, data=data, files=files, timeout=120)
    payload = resp.json() if resp.headers.get("Content-Type", "").startswith("application/json") else {"raw": resp.text}
    if resp.status_code >= 400:
        raise RuntimeError(f"upload_all http error: {payload}")
    if payload.get("code") != 0:
        raise RuntimeError(f"upload_all failed: {payload}")
    file_token = (payload.get("data") or {}).get("file_token")
    if not file_token:
        raise RuntimeError(f"upload_all missing file_token: {payload}")
    return file_token


def create_import_task(host: str, token: str, *, file_token: str, file_extension: str, target_type: str, file_name: str = "", mount_key: str = "") -> str:
    """
    文档： https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/import_task/create
    """
    url = f"{host}/open-apis/drive/v1/import_tasks"
    body = {
        "file_extension": file_extension,
        "file_token": file_token,
        "type": target_type,
        "point": {"mount_type": 1, "mount_key": mount_key},
    }
    if file_name:
        body["file_name"] = file_name
    data = post_json(url, token, body)
    if data.get("code") != 0:
        raise RuntimeError(f"create import task failed: {data}")
    ticket = (data.get("data") or {}).get("ticket")
    if not ticket:
        raise RuntimeError(f"create import task missing ticket: {data}")
    return ticket


def wait_import_result(host: str, token: str, ticket: str, *, timeout_s: int = 120) -> Tuple[str, Optional[str]]:
    """
    返回 (doc_token, url)
    注意：实际返回结构是 {result: {job_status, token, url, ...}}
    """
    url = f"{host}/open-apis/drive/v1/import_tasks/{ticket}"
    deadline = time.time() + timeout_s
    last = object()
    while time.time() < deadline:
        data = get_json(url, token)
        if data.get("code") != 0:
            raise RuntimeError(f"get import task failed: {data}")
        result = (data.get("data") or {}).get("result") or (data.get("data") or {})
        job_status = result.get("job_status")
        if job_status != last:
            print("导入 job_status:", job_status, "msg:", result.get("job_error_msg"))
            last = job_status
        if job_status == 0:
            return result.get("token"), result.get("url")
        if job_status == 1:
            raise RuntimeError(f"import failed: {result}")
        time.sleep(1)
    raise RuntimeError(f"import timeout, ticket={ticket}")


def batch_get_user_id_by_email(host: str, token: str, email: str) -> dict:
    url = f"{host}/open-apis/contact/v3/users/batch_get_id"
    body = {"emails": [email], "include_resigned": False}
    data = post_json(url, token, body)
    if data.get("code") != 0:
        raise RuntimeError(f"batch_get_id failed: {data}")
    items = ((data.get("data") or {}).get("user_list")) or []
    if not items:
        raise RuntimeError(f"邮箱未查到用户: {email}, resp={data}")
    return items[0]


def grant_edit_permission(host: str, token: str, doc_token: str, email: str) -> None:
    _ = batch_get_user_id_by_email(host, token, email)
    url = f"{host}/open-apis/drive/v1/permissions/{doc_token}/members?type=docx"
    body = {"member_type": "email", "member_id": email, "perm": "edit", "perm_type": "container"}
    data = post_json(url, token, body)
    if data.get("code") != 0:
        raise RuntimeError(f"grant permission failed: {data}")


def pandoc_available() -> bool:
    try:
        cp = subprocess.run(["pandoc", "-v"], capture_output=True, text=True, timeout=10)
        return cp.returncode == 0
    except Exception:
        return False


_MD_IMAGE_RE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")

def normalize_md_for_pandoc(md_path: Path) -> Path:
    """
    规范化 Markdown 中的图片链接，提升 pandoc 对 Windows 绝对路径图片的兼容性。

    支持的输入例子：
    - ![](D:\\a\\b.png)
    - ![](<D:\\a\\b.png>)
    - ![](D:/a/b.png)

    处理策略：
    - Windows 绝对路径（盘符）→ D:/...（仅把反斜杠改成正斜杠；不做 file:// URI/不做编码，确保图片能被嵌入 docx）
    - 其他路径：将反斜杠替换为正斜杠（避免被当作转义）
    """
    raw = md_path.read_text(encoding="utf-8", errors="ignore")

    def repl(m: re.Match) -> str:
        alt = m.group(1)
        inner = m.group(2).strip()

        # 处理 <...> 包裹
        wrapped = inner.startswith("<") and inner.endswith(">")
        if wrapped:
            inner = inner[1:-1].strip()

        # 尝试分离 title（只处理最常见的：path "title" / path 'title' / path (title)）
        # 如果解析失败就按整段当作 path。
        path_part = inner
        tail = ""
        for sep in [' "', " '", " ("]:
            idx = inner.find(sep)
            if idx != -1:
                path_part = inner[:idx].strip()
                tail = inner[idx:]
                break

        # Windows 盘符绝对路径：D:\... 或 D:/...
        is_drive_abs = bool(re.match(r"^[a-zA-Z]:[\\/]", path_part))
        posix_like = path_part.replace("\\", "/")
        new_inner = (posix_like if is_drive_abs else posix_like) + tail

        # 若原来没用 <...> 包裹，但路径含空格，则自动用 <...> 包裹避免解析问题
        if (not wrapped) and (" " in posix_like):
            wrapped_local = True
        else:
            wrapped_local = wrapped

        if wrapped_local:
            new_inner = f"<{new_inner}>"
        return f"![{alt}]({new_inner})"

    normalized = _MD_IMAGE_RE.sub(repl, raw)

    out = md_path.with_name(md_path.stem + ".__pandoc_normalized.md")
    if out.exists():
        try:
            out.unlink()
        except Exception:
            pass
    out.write_text(normalized, encoding="utf-8")
    return out


def md_to_docx_with_pandoc(md_path: Path, out_docx: Path) -> None:
    """
    使用 pandoc 在本地将 md 转 docx，确保相对图片能被打进 docx。
    """
    normalized_md = normalize_md_for_pandoc(md_path)
    resource_path = str(md_path.parent)
    cmd = [
        "pandoc",
        str(normalized_md),
        "-o",
        str(out_docx),
        "--resource-path",
        resource_path,
    ]
    cp = subprocess.run(cmd, capture_output=True, text=True)
    if cp.returncode != 0:
        raise RuntimeError(f"pandoc failed: {cp.stderr or cp.stdout}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--md", required=True, help="Markdown 文件路径")
    ap.add_argument("--grant-email", required=True, help="需要授权的邮箱")
    ap.add_argument("--host", default=DEFAULT_HOST, help="OpenAPI Host，默认 https://open.feishu.cn")
    args = ap.parse_args()

    # 允许用环境变量覆盖（便于以后换密钥），否则使用脚本内置密钥
    app_id = os.getenv("FEISHU_APP_ID", "").strip() or APP_ID
    app_secret = os.getenv("FEISHU_APP_SECRET", "").strip() or APP_SECRET

    md_path = Path(args.md)
    if not md_path.exists():
        raise FileNotFoundError(f"md 不存在: {md_path}")

    host = args.host.rstrip("/")
    token = get_tenant_access_token(host, app_id, app_secret)

    # 生成/选择 docx 源文件
    docx_path = md_path.with_suffix(".docx")
    if docx_path.exists():
        print("检测到同名 docx，直接导入:", docx_path)
    else:
        if not pandoc_available():
            raise RuntimeError(
                "未检测到 pandoc，无法把 md(含本地图片) 高保真转换为 docx。\n"
                "请安装 pandoc，或在 md 同目录提供同名 docx（例如 xxx.docx）。"
            )
        print("使用 pandoc 将 md 转 docx（包含图片）...")
        md_to_docx_with_pandoc(md_path, docx_path)
        print("已生成:", docx_path)

    print("上传 docx 到云空间...")
    try:
        src_token = upload_file_to_drive(host, token, docx_path, parent_node="")
    except Exception:
        src_token = upload_file_to_drive(host, token, docx_path, parent_node="0")
    print("src file_token:", src_token)

    print("创建导入任务 import_tasks...")
    ticket = create_import_task(
        host,
        token,
        file_token=src_token,
        file_extension="docx",
        target_type="docx",
        file_name=docx_path.stem,
        mount_key="",
    )
    print("ticket:", ticket)

    doc_token, url = wait_import_result(host, token, ticket, timeout_s=180)
    if not doc_token:
        raise RuntimeError("导入成功但未返回 doc_token")

    grant_edit_permission(host, token, doc_token, args.grant_email)

    # 输出链接：优先接口返回的 mi.feishu.cn
    print("document_id:", doc_token)
    if url:
        print("访问链接:", url)
    else:
        print("访问链接:", f"https://www.feishu.cn/docx/{doc_token}")


if __name__ == "__main__":
    main()
## AIGC END

