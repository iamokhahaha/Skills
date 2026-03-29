# STT 时间轴对齐 & 字幕生成

> 从 SKILL.md 提取的 Phase 4 (STT) 和 Phase 5c (字幕) 详细说明。

## Phase 4: STT 时间轴对齐

### 脚本: `scripts/stt_timing.py`

用 ElevenLabs Scribe STT 获取逐字时间戳，再用锚点文本匹配各图片的切换时间。

```python
# ElevenLabs STT API
resp = requests.post(
    "https://api.elevenlabs.io/v1/speech-to-text",
    headers={"xi-api-key": API_KEY},
    files={"file": (filename, f, "audio/mpeg")},
    data={"model_id": "scribe_v1", "language_code": "zh"},
)
words = resp.json()["words"]  # [{text, start, end}, ...]
```

### 输出文件
- `src/lib/stt_raw.json` — 原始逐字数据
- `src/lib/timeline.json` — 图像时间轴 `[{id, act, startSec, endSec, durationSec}]`

### STT 校对: `scripts/proofread_stt.py`

STT 转录中文时会产生同音字错误（如 "周林"->"周凌"、"仲裁器"->"仲裁机"）。校对脚本用原文（`narration_texts.py`）纠正这些错误，保留 STT 的字级时间戳。

```python
# 核心算法：difflib.SequenceMatcher 对齐
# 输入: stt_raw.json + narration_texts.py
# 输出: stt_corrected.json（同格式，文字已校对）
python scripts/proofread_stt.py
```

- 对齐后，锚点可以直接用原文中的句子，不需要适配 STT 错字
- 字幕文字 100% 正确（来自原文而非 STT 转录）
- `gen_subtitles.py` 和 `stt_timing.py` 都读取 `stt_corrected.json`

### 锚点匹配逻辑
1. 将校对后的 words 拼接为全文，建立字符->时间映射
2. 去掉标点后搜索锚点文本的位置
3. 找到位置对应的 word start time 即为该图的起始时间
4. 未找到锚点时在前后已知点之间插值

### 注意
- STT 对非目标语言（如拉丁文）会产生 artifact（如 `<|agent|><|nolang|>`），需在字幕阶段特殊处理
- STT 时间是相对于单个音频文件的，需要加上 act 偏移量得到绝对时间

## Phase 5c: 字幕生成 — `scripts/gen_subtitles.py`

从 `stt_corrected.json` 生成 `subtitles.json`。

### 三步处理
1. **Tokenize**: 将字符列表中连续的 ASCII/数字字符合并为原子 token（如 "2022"、"Claude"、"commit" 不可拆分）
2. **Split**: 先按句号拆句（。！？），再在句内按从句标点（，、；：）拆分
   - 目标每段 ~14 字，最大 22 字，从句最少 7 字
   - 原子 token 内部不拆分，避免 "202|2年" 或 "GitHubCo|pilot" 的问题
3. **Post-process**: 合并过短的段（<=2 个内容字符），应用英文术语修复

### 英文术语修复
STT 转录中文时会丢失英文词间空格（如 "Claude Code" -> "ClaudeCode"）。在 `ENGLISH_FIXES` 字典中定义已知术语的正确拼写，字幕生成时自动替换：

```python
ENGLISH_FIXES = {
    "ClaudeCode": "Claude Code",
    "GitHubCopilot": "GitHub Copilot",
    "contributiongraph": "contribution graph",
}
```

### 时间偏移
字幕的时间需要加上 act 偏移量（与 timing.ts 中相同的逻辑）。

### JSON 兼容性后处理（必须）

Python `json.dump` 输出的 JSON 在 webpack（Remotion 底层打包器）的 JSON parser 中可能解析失败（编码/换行符差异）。**所有 Python 生成的 JSON 文件必须通过 Node 重新序列化**后才能被 Remotion 使用：

```bash
node -e "
const fs = require('fs');
['timeline.json', 'subtitles.json', 'stt_corrected.json'].forEach(f => {
  const p = 'src/lib/' + f;
  if (fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify(JSON.parse(fs.readFileSync(p, 'utf8')), null, 2) + '\n');
    console.log('Rewritten:', f);
  }
});
"
```

在 `stt_timing.py` 和 `gen_subtitles.py` 执行完毕后立即运行此命令。
