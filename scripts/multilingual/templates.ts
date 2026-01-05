/**
 * GigaMind Multilingual - Language-Specific Templates
 *
 * System prompts and category descriptions for each supported language.
 */

import type { SupportedLanguage } from "./types.js";

// ============================================================================
// Note Generation System Prompts
// ============================================================================

export const NOTE_SYSTEM_PROMPTS: Record<SupportedLanguage, string> = {
  ko: `당신은 개인 지식 관리 시스템의 노트를 생성하는 AI입니다.
주어진 카테고리에 맞는 한국어 개인 노트를 생성하세요.

요구사항:
1. 제목: 5-50자, 구체적이고 검색 가능한 제목
2. 내용: 200-600자, 마크다운 형식, 실제 경험/생각처럼 작성
3. 태그: 2-4개, 관련 키워드 (한국어)
4. 위키링크: 주어진 타이틀 풀에서 1-3개 선택하여 자연스럽게 내용에 포함

반드시 JSON 형식으로만 응답하세요:
{"title": "제목", "content": "내용...", "tags": ["태그1", "태그2"], "wikilinks": ["링크1"]}`,

  en: `You are an AI that generates notes for a personal knowledge management system.
Generate a personal note in English matching the given category.

Requirements:
1. Title: 5-50 characters, specific and searchable
2. Content: 200-600 characters, markdown format, written like real experiences/thoughts
3. Tags: 2-4 relevant keywords in English
4. Wikilinks: Select 1-3 from the provided title pool and include naturally in content

Respond ONLY in JSON format:
{"title": "Title", "content": "Content...", "tags": ["tag1", "tag2"], "wikilinks": ["link1"]}`,

  ja: `あなたは個人知識管理システムのノートを生成するAIです。
指定されたカテゴリに合った日本語の個人ノートを生成してください。

要件:
1. タイトル: 5-50文字、具体的で検索可能
2. 内容: 200-600文字、マークダウン形式、実際の経験/考えのように書く
3. タグ: 2-4個の関連キーワード（日本語）
4. ウィキリンク: 提供されたタイトルプールから1-3個選択して自然に内容に含める

必ずJSON形式のみで回答してください:
{"title": "タイトル", "content": "内容...", "tags": ["タグ1", "タグ2"], "wikilinks": ["リンク1"]}`,

  zh: `你是一个为个人知识管理系统生成笔记的AI。
根据给定的类别生成中文个人笔记。

要求:
1. 标题: 5-50个字符，具体且可搜索
2. 内容: 200-600个字符，markdown格式，像真实经历/想法一样写
3. 标签: 2-4个相关关键词（中文）
4. 维基链接: 从提供的标题池中选择1-3个，自然地包含在内容中

必须只用JSON格式回复:
{"title": "标题", "content": "内容...", "tags": ["标签1", "标签2"], "wikilinks": ["链接1"]}`,
};

// ============================================================================
// Category Descriptions
// ============================================================================

export const CATEGORY_PROMPTS: Record<SupportedLanguage, Record<string, string>> = {
  ko: {
    일상: "일상생활, 개인 경험, 관찰, 감상에 관한 노트를 작성하세요. 카페, 음식점, 여행, 쇼핑 등 일상적인 활동과 느낌을 담아주세요.",
    기술: "프로그래밍, 소프트웨어, 기술 트렌드, 개발 팁에 관한 노트를 작성하세요. 실제 사용해본 도구나 배운 기술적 내용을 담아주세요.",
    독서: "책 리뷰, 인용문, 독서 인사이트, 읽은 내용의 요약에 관한 노트를 작성하세요. 책에서 얻은 교훈이나 인상 깊은 구절을 담아주세요.",
    아이디어: "프로젝트 아이디어, 창의적 개념, 미래 계획, 브레인스토밍에 관한 노트를 작성하세요. 실현하고 싶은 계획이나 떠오른 생각을 담아주세요.",
  },
  en: {
    Tech: "Write a note about programming, software, technology trends, or development tips. Include real experiences with tools or technical concepts you've learned.",
    Learning: "Write a note about something you learned, a skill you're developing, online courses, or educational insights. Share what stuck with you.",
    Projects: "Write a note about a project, side hustle, work endeavor, or collaboration. Document progress, challenges, or outcomes.",
    Ideas: "Write a note about creative ideas, future plans, brainstorming sessions, or innovative concepts. Capture thoughts you want to explore.",
  },
  ja: {
    旅行: "旅行体験、訪れた場所、旅のヒント、観光地についてのノートを書いてください。実際に行った場所の感想や発見を含めてください。",
    文化: "文化、芸術、伝統、イベントについてのノートを書いてください。映画、音楽、展覧会などの文化的体験を含めてください。",
    メディア: "映画、本、ポッドキャスト、動画コンテンツについてのノートを書いてください。見たものや聞いたものの感想を含めてください。",
    技術: "テクノロジー、プログラミング、デジタルツールについてのノートを書いてください。使ったツールや学んだ技術的な内容を含めてください。",
  },
  zh: {
    技术: "写一篇关于技术、编程、数字工具或开发技巧的笔记。包括你实际使用过的工具或学到的技术内容。",
    学习: "写一篇关于学习、技能发展、在线课程或教育见解的笔记。分享让你印象深刻的内容。",
    商业: "写一篇关于商业、创业、工作项目或职业发展的笔记。记录进展、挑战或成果。",
    生活: "写一篇关于日常生活、个人经历、观察或感想的笔记。包括餐厅、旅行、购物等日常活动。",
  },
};

// ============================================================================
// Title Pool Generation Prompts
// ============================================================================

export const TITLE_POOL_PROMPTS: Record<SupportedLanguage, string> = {
  ko: `개인 지식 관리 노트 제목 목록을 생성해주세요.

카테고리: 일상, 기술, 독서, 아이디어
개수: {count}개

요구사항:
- 각 제목은 5-40자
- 구체적이고 검색 가능한 제목
- 실제 개인 노트처럼 다양한 주제
- 한 줄에 하나씩 출력

예시:
SF 출장에서 먹은 최고의 라멘집
React 18의 새로운 기능 정리
사피엔스를 읽고 든 생각
내년에 만들어볼 사이드 프로젝트 아이디어`,

  en: `Generate a list of personal knowledge management note titles.

Categories: Tech, Learning, Projects, Ideas
Count: {count} titles

Requirements:
- Each title 5-40 characters
- Specific and searchable
- Diverse topics like real personal notes
- Output one per line

Examples:
Best coffee shops in San Francisco
How to use TypeScript generics effectively
Notes from Atomic Habits book
My app idea for local community events`,

  ja: `個人知識管理ノートのタイトルリストを生成してください。

カテゴリ: 旅行, 文化, メディア, 技術
個数: {count}個

要件:
- 各タイトルは5-40文字
- 具体的で検索可能
- 実際の個人ノートのような多様なトピック
- 1行に1つずつ出力

例:
京都で訪れた隠れた名所
鬼滅の刃を見た感想
Pythonでデータ分析を学ぶ
来年の旅行計画リスト`,

  zh: `生成个人知识管理笔记标题列表。

类别: 技术, 学习, 商业, 生活
数量: {count}个

要求:
- 每个标题5-40个字符
- 具体且可搜索
- 像真实个人笔记一样多样化的主题
- 每行输出一个

示例:
上海最好吃的小笼包店
Python机器学习入门笔记
读完原则后的思考
我的副业项目想法`,
};

// ============================================================================
// Query Templates
// ============================================================================

export const QUERY_TEMPLATES: Record<SupportedLanguage, string[]> = {
  ko: [
    "<topic>에 대해 알려줘",
    "<topic>이(가) 뭐야?",
    "<topic> 내용 요약해줘",
    "<topic>은(는) 어떻게 됐어?",
    "<topic> 관련 노트 찾아줘",
  ],
  en: [
    "What is <topic>?",
    "Tell me about <topic>",
    "Summarize <topic>",
    "Explain <topic> to me",
    "Find notes about <topic>",
  ],
  ja: [
    "<topic>について教えて",
    "<topic>とは何ですか?",
    "<topic>を要約して",
    "<topic>について説明して",
    "<topic>に関するノートを探して",
  ],
  zh: [
    "什么是<topic>?",
    "给我讲讲<topic>",
    "总结一下<topic>",
    "解释<topic>",
    "找找关于<topic>的笔记",
  ],
};

// ============================================================================
// Cross-Lingual Query Templates
// ============================================================================

export const CROSS_LINGUAL_TEMPLATES: Record<SupportedLanguage, string[]> = {
  ko: [
    "<topic>에 대한 정보 찾아줘",
    "<topic> 관련 내용 알려줘",
    "<topic>이 뭔지 설명해줘",
  ],
  en: [
    "Find information about <topic>",
    "What do you know about <topic>?",
    "Search for <topic>",
  ],
  ja: [
    "<topic>の情報を探して",
    "<topic>について知っていることを教えて",
    "<topic>を検索して",
  ],
  zh: [
    "找找<topic>的信息",
    "你知道<topic>是什么吗?",
    "搜索<topic>",
  ],
};
