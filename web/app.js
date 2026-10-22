(() => {
  // Trạng thái toàn cục của ứng dụng
  const state = {
    mode: "general",
    messages: [],
    documentText: "",
    documentName: "",
    temperature: 0.3,
    numCtx: 8192,
    maxTokens: 3000,
    isStreaming: false,
  };

  // Lưu trạng thái nguồn truy cập (Mã QR) để duy trì xuyên suốt phiên chat
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("src") === "qr") {
      sessionStorage.setItem("ai_visit_source", "qr");
    }
  } catch (_) {}
  const modelSelect = document.getElementById("modelSelect");
  const navModes = document.getElementById("navModes");
  const heroSection = document.getElementById("heroSection");
  const chatStream = document.getElementById("chatStream");
  const promptInput = document.getElementById("promptInput");
  const sendBtn = document.getElementById("sendBtn");
  const attachBtn = document.getElementById("attachBtn");
  const fileInput = document.getElementById("fileInput");
  const composerDock = document.getElementById("composerDock");
  const dockMiniBar = document.getElementById("dockMiniBar");
  const miniExpandBtn = document.getElementById("miniExpandBtn");
  const dockMinimizeBtn = document.getElementById("dockMinimizeBtn");
  const uploadTriggerBtn = document.getElementById("uploadTriggerBtn");
  const uploadTriggerLabel = document.getElementById("uploadTriggerLabel");
  const u032Upload = document.getElementById("u032Upload");
  const u032CloseBtn = document.getElementById("u032CloseBtn");
  const u032Zone = document.getElementById("u032Zone");
  const u032List = document.getElementById("u032List");
  const clearChatBtn = document.getElementById("clearChatBtn");
  const resetHomeBtn = document.getElementById("resetHomeBtn");
  const themeToggleBtn = document.getElementById("themeToggleBtn");

  // Modals
  const settingsModal = document.getElementById("settingsModal");
  const openSettingsBtn = document.getElementById("openSettingsBtn");
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  const tempInput = document.getElementById("tempInput");
  const tempVal = document.getElementById("tempVal");
  const ctxInput = document.getElementById("ctxInput");
  const ctxVal = document.getElementById("ctxVal");
  const maxTokensInput = document.getElementById("maxTokensInput");
  const maxTokensVal = document.getElementById("maxTokensVal");

  const shareModal = document.getElementById("shareModal");
  const openShareBtn = document.getElementById("openShareBtn");
  const closeShareBtn = document.getElementById("closeShareBtn");
  const localUrlText = document.getElementById("localUrlText");
  const tunnelUrlText = document.getElementById("tunnelUrlText");

  // 1. Khởi tạo danh sách Model từ /api/models
  async function loadModels() {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      modelSelect.innerHTML = "";
      if (data.models && data.models.length > 0) {
        // Sắp xếp: qwen2.5:7b lên đầu tiên
        const sorted = [...data.models].sort((a, b) => {
          if (a === "qwen2.5:7b") return -1;
          if (b === "qwen2.5:7b") return 1;
          return 0;
        });

        sorted.forEach((m) => {
          const opt = document.createElement("option");
          opt.value = m;
          let label = m;
          if (m === "qwen2.5:7b") {
            label = "qwen2.5:7b ⚡ (7B Fast)";
          } else if (m.includes("deepseek-r1")) {
            label = "deepseek-r1:7b 🧠 (DeepSeek)";
          } else if (m.includes("14b")) {
            label = "qwen2.5:14b ⚠️ (14B Nặng)";
          } else if (m.includes("smollm")) {
            label = "smollm:135m 🚀 (Siêu nhẹ)";
          }
          opt.textContent = label;
          if (m === "qwen2.5:7b") opt.selected = true;
          modelSelect.appendChild(opt);
        });

        // Ép chọn qwen2.5:7b để bảo vệ GPU
        modelSelect.value = "qwen2.5:7b";
      } else {
        modelSelect.innerHTML = `<option value="qwen2.5:7b">qwen2.5:7b (Mặc định)</option>`;
      }
    } catch (err) {
      modelSelect.innerHTML = `<option value="qwen2.5:7b">Ollama chưa bật</option>`;
    }
  }

  modelSelect.addEventListener("change", (e) => {
    if (e.target.value.includes("14b")) {
      alert("⚠️ CẢNH BÁO PHẦN CỨNG:\nMô hình 14B ngốn tới ~9GB VRAM (vượt quá 8GB của RTX 4060 Laptop). Nó sẽ tràn sang RAM máy tính khiến máy bị nóng và chạy chậm.\n\n👉 Khuyên bạn nên giữ mô hình 'qwen2.5:7b' để đạt tốc độ 25-35 tok/s và giữ GPU mát mẻ.");
    }
  });

  // 2. Render tĩnh công thức LaTeX trên các thẻ Hero gợi ý ngoài trang chủ
  function renderStaticHeroMath() {
    if (!window.katex) return;
    document.querySelectorAll(".shelf-card .card-visual span").forEach((el) => {
      const raw = el.textContent.trim();
      const match = raw.match(/^\$\$([\s\S]+?)\$\$$/) || raw.match(/^\$([^\$\n]+?)\$$/);
      if (match) {
        try {
          el.innerHTML = katex.renderToString(match[1].trim(), {
            displayMode: true,
            throwOnError: false,
            strict: false,
            trust: true,
          });
        } catch (_) {}
      } else if (raw.includes("\\")) {
        try {
          el.innerHTML = katex.renderToString(raw, {
            displayMode: true,
            throwOnError: false,
            strict: false,
            trust: true,
          });
        } catch (_) {}
      }
    });
  }

  // 3. Quy trình 5 bước chuẩn hóa & render Markdown kèm KaTeX không bị nuốt ký tự $
  function renderMarkdownWithMath(rawText) {
    if (!rawText) return "";

    // Xử lý khối suy luận <think>...</think> của DeepSeek-R1 / Reasoning models
    let thinkingHtml = "";
    let cleanText = rawText;
    if (cleanText.includes("<think>")) {
      const endIdx = cleanText.indexOf("</think>");
      if (endIdx !== -1) {
        const thinkRaw = cleanText.slice(cleanText.indexOf("<think>") + 7, endIdx).trim();
        cleanText = cleanText.slice(endIdx + 8).trim();
        thinkingHtml = `<details class="reasoning-box"><summary class="reasoning-header"><span class="pulse-dot"></span> Quá trình Suy luận & Phân tích chuyên sâu ✓</summary><div class="reasoning-body">${window.marked ? marked.parse(thinkRaw) : thinkRaw}</div></details>`;
      } else {
        const thinkRaw = cleanText.slice(cleanText.indexOf("<think>") + 7).trim();
        cleanText = "";
        thinkingHtml = `<details class="reasoning-box" open><summary class="reasoning-header"><span class="pulse-dot"></span> Đang suy luận từng bước...</summary><div class="reasoning-body">${window.marked ? marked.parse(thinkRaw) : thinkRaw}</div></details>`;
      }
    }

    if (!cleanText && thinkingHtml) {
      return thinkingHtml;
    }

    // Bước 1: Gỡ dấu backtick nếu bên trong là công thức toán `$...$` hoặc `$$...$$`
    let text = cleanText.replace(/`(\${1,2}[^\n`]+?\${1,2})`/g, "$1");

    // Tách và cất các khối code ```...``` và inline code `...` vào mảng tạm @@CODE_BLOCK_i@@
    const codeBlocks = [];
    text = text.replace(/```[\s\S]*?```/g, (match) => {
      const id = `@@CODE_BLOCK_${codeBlocks.length}@@`;
      codeBlocks.push({ id, content: match });
      return id;
    });

    text = text.replace(/`[^`\n]+?`/g, (match) => {
      const id = `@@CODE_BLOCK_${codeBlocks.length}@@`;
      codeBlocks.push({ id, content: match });
      return id;
    });

    // Bước 2: Bắt toàn bộ các định dạng toán học của Qwen/DeepSeek và lưu vào mảng @@MATH_TOKEN_i@@
    const mathTokens = [];

    // 2.1 Environments
    text = text.replace(/\\begin\{(equation\*?|aligned|align\*?|gather\*?|matrix|bmatrix|pmatrix|vmatrix|cases)\}([\s\S]+?)\\end\{\1\}/g, (match) => {
      const id = `@@MATH_TOKEN_${mathTokens.length}@@`;
      mathTokens.push({ id, tex: match.trim(), display: true });
      return id;
    });

    // 2.2 \[ ... \]
    text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => {
      const id = `@@MATH_TOKEN_${mathTokens.length}@@`;
      mathTokens.push({ id, tex: tex.trim(), display: true });
      return id;
    });

    // 2.3 $$ ... $$
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
      const id = `@@MATH_TOKEN_${mathTokens.length}@@`;
      mathTokens.push({ id, tex: tex.trim(), display: true });
      return id;
    });

    // 2.4 \( ... \)
    text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => {
      const id = `@@MATH_TOKEN_${mathTokens.length}@@`;
      mathTokens.push({ id, tex: tex.trim(), display: false });
      return id;
    });

    // 2.5 $ ... $
    text = text.replace(/\$([^\$\n]+?)\$/g, (_, tex) => {
      const id = `@@MATH_TOKEN_${mathTokens.length}@@`;
      mathTokens.push({ id, tex: tex.trim(), display: false });
      return id;
    });

    // Bước 3: Khôi phục lại các khối code bằng callback text.replace(cb.id, () => cb.content)
    codeBlocks.forEach((cb) => {
      text = text.replace(cb.id, () => cb.content);
    });

    // Bước 4: Chạy marked.parse(text)
    let html = window.marked ? marked.parse(text) : text;

    // BẢO MẬT DOM XSS: Lọc sạch toàn bộ mã HTML độc hại bằng DOMPurify
    if (window.DOMPurify) {
      html = DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true, svg: true, mathMl: true },
        ADD_ATTR: ["target", "rel"],
      });
    }

    // Bước 5: Thay thế các @@MATH_TOKEN_i@@ bằng kết quả katex.renderToString
    // BẮT BUỘC dùng hàm callback html.replace(item.id, () => rendered) để dấu $ không bị JavaScript cắt mất chữ
    mathTokens.forEach((item) => {
      let rendered = item.tex;
      if (window.katex) {
        try {
          rendered = katex.renderToString(item.tex, {
            displayMode: item.display,
            throwOnError: false,
            strict: false,
            trust: true,
          });
        } catch (_) {
          rendered = `<span class="katex-error">${item.tex}</span>`;
        }
      }
      html = html.replace(item.id, () => rendered);
    });

    return thinkingHtml + html;
  }

  // 3. Nâng cấp các khối <pre><code> thành khung thực thi Sandbox Python
  function enhanceCodeBlocks(container) {
    const pres = container.querySelectorAll("pre");
    pres.forEach((pre) => {
      if (pre.parentElement.classList.contains("code-wrapper")) return;
      const codeEl = pre.querySelector("code");
      const rawCode = codeEl ? codeEl.innerText : pre.innerText;
      const langClass = codeEl ? codeEl.className : "";
      const isPython =
        langClass.includes("python") ||
        langClass.includes("py") ||
        (!langClass && (rawCode.includes("import ") || rawCode.includes("print(")));

      const wrapper = document.createElement("div");
      wrapper.className = "code-wrapper";

      const header = document.createElement("div");
      header.className = "code-header";
      header.innerHTML = `<span>${isPython ? "Python • Sandbox Ready" : "Code"}</span>`;

      const actions = document.createElement("div");
      actions.className = "code-actions";

      const copyBtn = document.createElement("button");
      copyBtn.className = "code-btn";
      copyBtn.textContent = "Sao chép";
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(rawCode);
        copyBtn.textContent = "Đã chép ✓";
        setTimeout(() => (copyBtn.textContent = "Sao chép"), 1500);
      };
      actions.appendChild(copyBtn);

      if (isPython) {
        const runBtn = document.createElement("button");
        runBtn.className = "code-btn run-sandbox-btn";
        runBtn.textContent = "▶ Chạy trong Sandbox";
        runBtn.onclick = () => executeInSandbox(rawCode, wrapper, runBtn);
        actions.appendChild(runBtn);
      }

      header.appendChild(actions);
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(header);
      wrapper.appendChild(pre);
    });
  }

  // 4. Gọi API /api/run_code chạy code cô lập với timeout 10s
  async function executeInSandbox(code, wrapper, btn) {
    btn.disabled = true;
    btn.textContent = "Đang chạy (Max 10s)...";

    let outBox = wrapper.querySelector(".sandbox-output");
    if (!outBox) {
      outBox = document.createElement("div");
      outBox.className = "sandbox-output";
      wrapper.appendChild(outBox);
    }
    outBox.classList.remove("error");
    outBox.textContent = "⏳ Đang thực thi trong tiến trình Sandbox...";

    try {
      const res = await fetch("/api/run_code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();

      if (!data.success) {
        outBox.classList.add("error");
        outBox.textContent =
          (data.error ? `${data.error}\n` : "") +
          (data.stderr || data.stdout || "Thực thi thất bại.");
      } else {
        outBox.textContent =
          data.stdout || (data.stderr ? ` Cảnh báo:\n${data.stderr}` : "✓ Chạy thành công (Không có output).");
      }
    } catch (err) {
      outBox.classList.add("error");
      outBox.textContent = "Lỗi kết nối Sandbox: " + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "▶ Chạy lại";
    }
  }

  // 4b. PPT-MASTER: Phân tích & Tự động kết xuất File PowerPoint (.pptx) + Carousel
  async function renderSlideDeckCarousel(container, rawMarkdown) {
    const lastUserMsg = (state.messages.slice().reverse().find(m => m.role === "user")?.content || "").toLowerCase();
    const isSlideRequest = state.mode === "slides" ||
      /(?:slide|thuyết trình|thuyet trinh|powerpoint|pptx|bài giảng|bai giang|trình chiếu|trinh chieu|deck|ppt)/i.test(lastUserMsg) ||
      /(?:slide|thuyết trình|thuyet trinh|powerpoint|pptx|bài giảng|trình chiếu|deck)/i.test(rawMarkdown);
    if (!isSlideRequest && !rawMarkdown.includes("SLIDE")) return;
    if (container.querySelector(".slide-deck-preview") || container.querySelector(".pptx-action-banner")) return;

    try {
      // 1. Tự động gọi API backend xuất file .pptx ngay lập tức
      const autoTitle = state.documentName ? state.documentName.replace(/\.[^/.]+$/, "") : "";
      const res = await fetch("/api/export_pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          markdown: rawMarkdown,
          title: autoTitle
        }),
      });
      const data = await res.json();
      if (!data.success || !data.download_url || !data.slides || data.slides.length < 1) {
        return;
      }

      const slides = data.slides;
      const downloadUrl = data.download_url;
      const filename = data.filename;
      const deckTitle = data.title || "Báo Cáo Thuyết Trình Nghiên Cứu";

      // 2. Dựng Thẻ Tải File Nổi Bật (Instant PPTX Download Banner)
      const bannerEl = document.createElement("div");
      bannerEl.className = "pptx-action-banner";
      bannerEl.innerHTML = `
        <div class="pptx-banner-content">
          <div class="pptx-icon-pill">PPTX</div>
          <div class="pptx-text-group">
            <span class="pptx-eyebrow">TẠO FILE THÀNH CÔNG • 100% OFFLINE</span>
            <strong class="pptx-title">🎉 File PowerPoint (.pptx) Đã Sẵn Sàng!</strong>
            <small class="pptx-sub">${deckTitle} • ${slides.length} Slide 16:9 Swiss Design • Đã nhúng Speaker Notes</small>
          </div>
        </div>
        <a href="${downloadUrl}" class="pptx-download-btn-instant" download="${filename}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Tải file PowerPoint (.pptx)
        </a>
      `;

      // 3. Dựng Carousel Trực Quan
      let currentIndex = 0;
      const deckEl = document.createElement("div");
      deckEl.className = "slide-deck-preview";
      deckEl.innerHTML = `
        <div class="slide-deck-header">
          <div class="slide-deck-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            Xem Trước Slide (${slides.length} Slide)
          </div>
          <a href="${downloadUrl}" class="download-pptx-btn" download="${filename}" title="Tải file PowerPoint về máy">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Tải file (.pptx)
          </a>
        </div>
        <div class="slide-stage">
          <div class="slide-card-face">
            <div class="slide-face-eyebrow"></div>
            <div class="slide-face-title"></div>
            <ul class="slide-face-bullets"></ul>
            <div class="slide-face-notes"></div>
          </div>
          <div class="slide-nav-bar">
            <button class="slide-nav-btn prev-btn">‹ Trước</button>
            <span class="slide-counter"></span>
            <button class="slide-nav-btn next-btn">Sau ›</button>
          </div>
        </div>
      `;

      function updateCard() {
        const cur = slides[currentIndex];
        deckEl.querySelector(".slide-face-eyebrow").textContent = `SLIDE ${cur.slide_num || currentIndex + 1} / ${slides.length} • SWISS DESIGN`;
        deckEl.querySelector(".slide-face-title").textContent = cur.title;
        const ul = deckEl.querySelector(".slide-face-bullets");
        ul.innerHTML = (cur.bullets || []).map(b => `<li>${b}</li>`).join("");
        const notesEl = deckEl.querySelector(".slide-face-notes");
        notesEl.textContent = cur.speaker_notes ? `💡 Speaker Notes: ${cur.speaker_notes}` : "💡 Ghi chú: Trình bày tự tin, nhấn mạnh số liệu chính.";
        deckEl.querySelector(".slide-counter").textContent = `Trang ${currentIndex + 1} / ${slides.length}`;
        deckEl.querySelector(".prev-btn").disabled = currentIndex === 0;
        deckEl.querySelector(".next-btn").disabled = currentIndex === slides.length - 1;
      }

      deckEl.querySelector(".prev-btn").onclick = () => {
        if (currentIndex > 0) { currentIndex--; updateCard(); }
      };
      deckEl.querySelector(".next-btn").onclick = () => {
        if (currentIndex < slides.length - 1) { currentIndex++; updateCard(); }
      };

      updateCard();
      container.appendChild(bannerEl);
      container.appendChild(deckEl);
    } catch (err) {
      console.warn("[Auto-PPTX Error]:", err);
    }
  }

  // 4b. TÍNH NĂNG INTERACTIVE STORYBOARD & TIMELINE EXPLORER (HỌC TỪ VIDEO 1 & 2 GEMINI 4 ARGON CANVAS)
  function renderInteractiveTimelineExplorer(container, markdownText) {
    if (!markdownText) return;
    const milestoneMatches = [...markdownText.matchAll(/###\s*🎬?\s*\[?MỐC\s*(\d+)(?:\s*\/\s*(\d+))?\]?:?\s*([^\n]+)/gi)];
    if (milestoneMatches.length < 2) return;

    try {
      const milestones = [];
      const blocks = markdownText.split(/(?=###\s*🎬?\s*\[?MỐC\s*\d+)/i);

      blocks.forEach(block => {
        const m = block.match(/###\s*🎬?\s*\[?MỐC\s*(\d+)(?:\s*\/\s*(\d+))?\]?:?\s*([^\n]+)/i);
        if (!m) return;
        const stepNum = m[1];
        const title = m[3].replace(/[\[\]]/g, "").trim();

        let period = "";
        let mechanism = [];
        let formula = "";
        let scene = "";
        let notes = "";

        const periodMatch = block.match(/-\s*\*\*⏱️?\s*Thời kỳ[^:]*:\*\*\s*([^\n]+)/i);
        if (periodMatch) period = periodMatch[1].trim();

        const sceneMatch = block.match(/-\s*\*\*🎨?\s*Khung cảnh[^:]*:\*\*\s*([^\n]+)/i);
        if (sceneMatch) scene = sceneMatch[1].trim();

        const notesMatch = block.match(/-\s*\*\*💡?\s*Ý nghĩa[^:]*:\*\*\s*([^\n]+)/i);
        if (notesMatch) notes = notesMatch[1].trim();

        const formulaMatch = block.match(/-\s*\*\*📐?\s*Công thức[^:]*:\*\*\s*([^\n]+)/i);
        if (formulaMatch) formula = formulaMatch[1].trim();

        const lines = block.split("\n");
        let inMech = false;
        lines.forEach(l => {
          if (l.match(/-\s*\*\*🎯?\s*Bản chất/i)) {
            inMech = true;
            const inline = l.replace(/-\s*\*\*🎯?\s*Bản chất[^:]*:\*\*/i, "").trim();
            if (inline) mechanism.push(inline);
          } else if (inMech) {
            if (l.match(/^\s*[-\*]\s*(.+)/)) {
              mechanism.push(l.replace(/^\s*[-\*]\s*/, "").trim());
            } else if (l.match(/^-\s*\*\*/)) {
              inMech = false;
            }
          }
        });

        milestones.push({
          step: stepNum,
          title: title,
          period: period || `Mốc 0${stepNum}`,
          mechanism: mechanism.length ? mechanism : ["Nghiên cứu và phân tích cơ chế trọng tâm."],
          formula: formula,
          scene: scene,
          notes: notes
        });
      });

      if (milestones.length < 2) return;

      let curIndex = 0;
      let playTimer = null;

      const explorerEl = document.createElement("div");
      explorerEl.className = "interactive-explorer";
      explorerEl.innerHTML = `
        <div class="explorer-topbar">
          <div class="explorer-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            INTERACTIVE TIMELINE EXPLORER
          </div>
          <button class="explorer-play-btn" type="button" title="Tự động tua qua các mốc">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span class="play-label">Tự động phát</span>
          </button>
        </div>
        <div class="explorer-scrubber-wrap">
          <div class="explorer-timeline-track">
            <div class="explorer-timeline-line"></div>
            ${milestones.map((m, idx) => `
              <div class="explorer-step-dot ${idx === 0 ? 'active' : ''}" data-idx="${idx}" title="${m.title}">
                0${idx + 1}
              </div>
            `).join("")}
          </div>
          <input type="range" class="explorer-range-slider" min="0" max="${milestones.length - 1}" value="0" />
        </div>
        <div class="explorer-card-viewport">
          <div class="explorer-card-view">
            <div class="explorer-card-period"></div>
            <div class="explorer-card-title"></div>
            <div class="explorer-card-body">
              <ul class="explorer-bullets"></ul>
            </div>
            <div class="explorer-formula-box" style="display:none; margin: 10px 0; padding: 10px 14px; background: rgba(0,0,0,0.04); border-radius: 8px; font-family:'JetBrains Mono',monospace; font-size:13px;"></div>
            <div class="explorer-card-scene" style="display:none;"></div>
            <div class="explorer-card-notes" style="display:none;"></div>
          </div>
        </div>
        <div class="explorer-bottom-nav">
          <button class="explorer-nav-btn exp-prev-btn">‹ Mốc trước</button>
          <span class="explorer-indicator">01 / 0${milestones.length}</span>
          <button class="explorer-nav-btn exp-next-btn">Mốc sau ›</button>
        </div>
      `;

      const slider = explorerEl.querySelector(".explorer-range-slider");
      const dots = explorerEl.querySelectorAll(".explorer-step-dot");
      const periodEl = explorerEl.querySelector(".explorer-card-period");
      const titleEl = explorerEl.querySelector(".explorer-card-title");
      const bulletsEl = explorerEl.querySelector(".explorer-bullets");
      const formulaEl = explorerEl.querySelector(".explorer-formula-box");
      const sceneEl = explorerEl.querySelector(".explorer-card-scene");
      const notesEl = explorerEl.querySelector(".explorer-card-notes");
      const indicatorEl = explorerEl.querySelector(".explorer-indicator");
      const prevBtn = explorerEl.querySelector(".exp-prev-btn");
      const nextBtn = explorerEl.querySelector(".exp-next-btn");
      const playBtn = explorerEl.querySelector(".explorer-play-btn");
      const playLabel = explorerEl.querySelector(".play-label");

      function updateMilestone(idx) {
        curIndex = Math.max(0, Math.min(milestones.length - 1, idx));
        slider.value = curIndex;

        dots.forEach((d, i) => {
          d.classList.toggle("active", i === curIndex);
        });

        const cur = milestones[curIndex];
        periodEl.textContent = `⏱️ ${cur.period}`;
        titleEl.textContent = `0${curIndex + 1}. ${cur.title}`;
        bulletsEl.innerHTML = cur.mechanism.map(b => `<li>${b}</li>`).join("");

        if (cur.formula) {
          formulaEl.style.display = "block";
          formulaEl.innerHTML = renderMarkdownWithMath(cur.formula);
        } else {
          formulaEl.style.display = "none";
        }

        if (cur.scene) {
          sceneEl.style.display = "block";
          sceneEl.innerHTML = `<strong>🎬 Khung cảnh trực quan:</strong> ${cur.scene}`;
        } else {
          sceneEl.style.display = "none";
        }

        if (cur.notes) {
          notesEl.style.display = "block";
          notesEl.innerHTML = `<strong>💡 Ý nghĩa thực tiễn:</strong> ${cur.notes}`;
        } else {
          notesEl.style.display = "none";
        }

        indicatorEl.textContent = `0${curIndex + 1} / 0${milestones.length}`;
        prevBtn.disabled = curIndex === 0;
        nextBtn.disabled = curIndex === milestones.length - 1;
      }

      slider.oninput = (e) => updateMilestone(parseInt(e.target.value, 10));
      dots.forEach(d => {
        d.onclick = () => updateMilestone(parseInt(d.dataset.idx, 10));
      });

      prevBtn.onclick = () => {
        stopAutoPlay();
        updateMilestone(curIndex - 1);
      };

      nextBtn.onclick = () => {
        stopAutoPlay();
        updateMilestone(curIndex + 1);
      };

      function stopAutoPlay() {
        if (playTimer) {
          clearInterval(playTimer);
          playTimer = null;
          playLabel.textContent = "Tự động phát";
        }
      }

      playBtn.onclick = () => {
        if (playTimer) {
          stopAutoPlay();
        } else {
          playLabel.textContent = "Tạm dừng";
          playTimer = setInterval(() => {
            if (curIndex >= milestones.length - 1) {
              updateMilestone(0);
            } else {
              updateMilestone(curIndex + 1);
            }
          }, 3500);
        }
      };

      updateMilestone(0);
      container.appendChild(explorerEl);
    } catch (err) {
      console.warn("[Interactive Explorer Error]:", err);
    }
  }

  // 5. Gửi tin nhắn và đọc luồng SSE từ /api/chat
  async function sendMessage(customText = null) {
    if (state.isStreaming) return;
    const text = (customText !== null ? customText : promptInput.value).trim();
    if (!text) return;

    heroSection.classList.add("collapsed");
    promptInput.value = "";
    promptInput.style.height = "auto";

    // Render bong bóng câu hỏi của người dùng
    const userRow = document.createElement("div");
    userRow.className = "msg-row user";
    const userBubble = document.createElement("div");
    userBubble.className = "user-bubble";
    userBubble.textContent = text;
    userRow.appendChild(userBubble);
    chatStream.appendChild(userRow);

    state.messages.push({ role: "user", content: text });

    // Tạo khung phản hồi của AI
    // Tạo khung phản hồi của AI
    const aiRow = document.createElement("div");
    aiRow.className = "msg-row assistant";
    const aiCard = document.createElement("div");
    aiCard.className = "ai-card";
    aiCard.innerHTML = `
      <div class="router-slot"></div>
      <div class="ai-content"><span style="color:var(--text-muted)">Đang tự động đánh giá câu hỏi & khởi động suy luận...</span></div>
    `;
    aiRow.appendChild(aiCard);
    chatStream.appendChild(aiRow);
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });

    const routerSlot = aiCard.querySelector(".router-slot");
    const contentSlot = aiCard.querySelector(".ai-content");

    state.isStreaming = true;
    let accumulated = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "auto",
          messages: state.messages,
          mode: state.mode,
          document_text: state.documentText,
          document_name: state.documentName,
          temperature: state.temperature,
          num_ctx: state.numCtx,
          max_tokens: state.maxTokens,
          client_source: sessionStorage.getItem("ai_visit_source") || "",
        }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let rafPending = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const lines = part.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") break;

            try {
              const parsed = JSON.parse(payload);

              // 1. Nhận diện gói tin Auto-Evaluate Model Router
              if (parsed.router) {
                const r = parsed.router;
                const currentModelBadge = document.getElementById("currentModelBadge");
                if (currentModelBadge) {
                  currentModelBadge.textContent = r.model.includes("deepseek") ? "DeepSeek-R1" : "Qwen 2.5";
                }
                routerSlot.innerHTML = `
                  <div class="auto-router-tag">
                    <span class="router-sparkle">✨ AUTO ROUTER:</span>
                    <strong>${r.badge}</strong>
                    <span class="router-reason">— ${r.reason}</span>
                  </div>
                `;
              }

              // 2. Stream nội dung văn bản
              if (parsed.c) {
                accumulated += parsed.c;
                if (!rafPending) {
                  rafPending = true;
                  requestAnimationFrame(() => {
                    contentSlot.innerHTML = renderMarkdownWithMath(accumulated);
                    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                    rafPending = false;
                  });
                }
              }
              if (parsed.err) {
                accumulated += `\n\n**Lỗi Ollama:** ${parsed.err}`;
                contentSlot.innerHTML = renderMarkdownWithMath(accumulated);
              }
              if (parsed.stats) {
                const s = parsed.stats;
                let statsEl = aiCard.querySelector(".stats-bar");
                if (!statsEl) {
                  statsEl = document.createElement("div");
                  statsEl.className = "stats-bar";
                  aiCard.appendChild(statsEl);
                }
                statsEl.innerHTML = `
                  <span>⚡ <strong>${s.tok_per_sec || 0}</strong> tok/s</span>
                  <span>📝 <strong>${s.tokens || 0}</strong> tokens</span>
                  <span>🧠 Context: <strong>${s.context_window || 8192}</strong></span>
                  <span>⏱️ Tổng: <strong>${s.total_duration || 0}s</strong></span>
                `;
              }
            } catch (_) {}
          }
        }
      }

      // Render toàn bộ kết quả cuối cùng và kích hoạt Sandbox Python & PPT-Master Carousel & Interactive Explorer
      contentSlot.innerHTML = renderMarkdownWithMath(accumulated);
      enhanceCodeBlocks(contentSlot);
      renderSlideDeckCarousel(aiCard, accumulated);
      renderInteractiveTimelineExplorer(aiCard, accumulated);
      state.messages.push({ role: "assistant", content: accumulated });
    } catch (err) {
      contentSlot.innerHTML = `<p style="color:#ff453a">Không thể kết nối tới máy chủ: ${err.message}</p>`;
    } finally {
      state.isStreaming = false;
    }
  }

  // 6. LUCIAN UX/UI PROMPT #032 · DRAG-AND-DROP UPLOAD LOGIC
  const TYPE_COLORS = {
    pdf: "#E5484D",
    csv: "#22A06B",
    tsv: "#22A06B",
    docx: "#2F8FE0",
    doc: "#2F8FE0",
    txt: "#8B6CFF",
    md: "#8B6CFF",
    json: "#D6731E",
    png: "#3D8BFF",
    jpg: "#22A06B",
    jpeg: "#22A06B",
  };

  function formatBytes(bytes) {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
    return Math.max(1, Math.round(bytes / 1024)) + " KB";
  }

  function uploadFile(file, existingRow = null) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const color = TYPE_COLORS[ext] || "#8E8A97";

    let row = existingRow;
    if (!row) {
      row = document.createElement("li");
      row.className = "u032-row";
      row.innerHTML = `
        <span class="u032-ic" style="--c:${color}" aria-hidden="true">${ext.slice(0, 4).toUpperCase() || "FILE"}</span>
        <span class="u032-meta">
          <b>${file.name}</b>
          <small>0 KB / ${formatBytes(file.size)} · 0%</small>
        </span>
        <span class="u032-st"><span class="u032-spin" aria-hidden="true"></span></span>
        <span class="u032-bar" aria-hidden="true"></span>
        <button class="u032-del" type="button" title="Gỡ tài liệu">✕</button>
      `;

      row.querySelector(".u032-del").onclick = () => {
        row.classList.add("out");
        setTimeout(() => {
          row.remove();
          if (state.documentName === file.name) {
            state.documentText = "";
            state.documentName = "";
            state.numCtx = 8192;
            if (ctxInput) ctxInput.value = "8192";
            if (ctxVal) ctxVal.textContent = "8192";
            promptInput.placeholder = "Đặt câu hỏi Kinh tế lượng, tải file CSV/PDF hoặc yêu cầu viết code Python/R...";
            if (uploadTriggerLabel) uploadTriggerLabel.textContent = "📎 Tải tài liệu (PDF, CSV)";
          }
        }, 300);
      };

      u032List.insertBefore(row, u032List.firstChild);
      while (u032List.children.length > 3) u032List.lastElementChild.remove();
    } else {
      row.className = "u032-row";
      const st = row.querySelector(".u032-st") || document.createElement("span");
      st.className = "u032-st";
      st.innerHTML = '<span class="u032-spin" aria-hidden="true"></span>';
      if (!row.contains(st)) row.appendChild(st);
    }

    const sm = row.querySelector("small");
    const st = row.querySelector(".u032-st");

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const p = Math.min(0.95, e.loaded / e.total);
        row.style.setProperty("--p", p.toFixed(3));
        sm.textContent = `${formatBytes(e.loaded)} / ${formatBytes(e.total)} · ${Math.round(p * 100)}%`;
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          row.style.setProperty("--p", "1");
          row.classList.add("done");
          sm.textContent = `${formatBytes(file.size)} · Đã nạp thành công (${data.word_count ? data.word_count.toLocaleString() + ' từ' : 'Sandbox Ready'})`;
          st.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.4"/></svg>';

          state.documentText = data.text;
          state.documentName = data.filename;
          if (uploadTriggerLabel) {
            uploadTriggerLabel.textContent = "📄 " + (data.filename.length > 24 ? data.filename.slice(0, 22) + "..." : data.filename);
          }

          let targetCtx = 16384;
          if (data.char_count > 45000) targetCtx = 20480;
          state.numCtx = targetCtx;
          if (ctxInput) ctxInput.value = String(targetCtx);
          if (ctxVal) ctxVal.textContent = String(targetCtx);

          promptInput.placeholder = `Hỏi đáp tài liệu "${data.filename}" hoặc yêu cầu phân tích dữ liệu...`;
        } catch (err) {
          handleFail("Lỗi phản hồi máy chủ");
        }
      } else {
        handleFail("Lỗi tải lên (HTTP " + xhr.status + ")");
      }
    };

    xhr.onerror = () => handleFail("Lỗi kết nối mạng");

    function handleFail(msg) {
      row.classList.add("fail");
      sm.textContent = msg + " · Bấm thử lại";
      st.outerHTML = '<button class="u032-retry" type="button">Thử lại</button>';
      const retryBtn = row.querySelector(".u032-retry");
      if (retryBtn) {
        retryBtn.onclick = () => {
          retryBtn.outerHTML = '<span class="u032-st"></span>';
          uploadFile(file, row);
        };
      }
    }

    xhr.open("POST", "/api/upload");
    xhr.send(formData);
  }

  // Bật / Tắt vùng kéo thả tài liệu
  function toggleUploadDrawer(show = null) {
    if (!u032Upload) return;
    const isCollapsed = u032Upload.classList.contains("collapsed");
    const willShow = show !== null ? show : isCollapsed;
    u032Upload.classList.toggle("collapsed", !willShow);
    if (uploadTriggerLabel) {
      uploadTriggerLabel.textContent = willShow ? "✕ Đóng tải file" : "📎 Tải tài liệu (PDF, CSV)";
    }
  }

  if (uploadTriggerBtn) {
    uploadTriggerBtn.addEventListener("click", () => toggleUploadDrawer());
  }

  if (u032CloseBtn) {
    u032CloseBtn.addEventListener("click", () => toggleUploadDrawer(false));
  }

  // Thu nhỏ / Mở rộng Dock
  function setDockMinimized(minimized) {
    if (!composerDock) return;
    composerDock.classList.toggle("is-minimized", minimized);
    if (!minimized) {
      setTimeout(() => promptInput.focus(), 150);
    }
  }

  if (dockMinimizeBtn) {
    dockMinimizeBtn.addEventListener("click", () => setDockMinimized(true));
  }

  if (dockMiniBar) {
    dockMiniBar.addEventListener("click", () => setDockMinimized(false));
  }

  if (miniExpandBtn) {
    miniExpandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setDockMinimized(false);
    });
  }

  // Phím tắt bàn phím
  window.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && composerDock && composerDock.classList.contains("is-minimized")) {
      setDockMinimized(false);
    }
    if (e.key === "Escape") {
      if (u032Upload && !u032Upload.classList.contains("collapsed")) {
        toggleUploadDrawer(false);
      }
    }
  });

  // Sự kiện kích hoạt File Picker
  if (u032Zone) {
    u032Zone.addEventListener("click", () => fileInput.click());
  }

  attachBtn.addEventListener("click", () => {
    toggleUploadDrawer(true);
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    Array.from(fileInput.files).forEach(f => uploadFile(f));
    fileInput.value = "";
  });

  // Sự kiện kéo thả toàn vùng (Marching dashed border & Area growth)
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => {
    if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      dragDepth++;
      if (composerDock && composerDock.classList.contains("is-minimized")) {
        setDockMinimized(false);
      }
      if (u032Upload) {
        toggleUploadDrawer(true);
        u032Upload.classList.add("is-over");
      }
    }
  });

  window.addEventListener("dragover", (e) => {
    if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
    }
  });

  window.addEventListener("dragleave", () => {
    dragDepth--;
    if (dragDepth <= 0) {
      dragDepth = 0;
      if (u032Upload) u032Upload.classList.remove("is-over");
    }
  });

  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    if (u032Upload) u032Upload.classList.remove("is-over");
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach(f => uploadFile(f));
    }
  });

  // 7. Sự kiện chọn chuyên ngành trên Navbar & Kệ Apple Shelf
  function setActiveMode(mode) {
    state.mode = mode;
    document.querySelectorAll(".nav-mode-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
  }

  if (navModes) {
    navModes.addEventListener("click", (e) => {
      const btn = e.target.closest(".nav-mode-item");
      if (!btn) return;
      setActiveMode(btn.dataset.mode);
    });
  }

  document.querySelectorAll(".shelf-card").forEach((card) => {
    card.addEventListener("click", () => {
      const mode = card.dataset.mode;
      const prompt = card.dataset.prompt;
      if (mode) setActiveMode(mode);
      if (card.id === "shelfUploadCard") {
        if (composerDock && composerDock.classList.contains("is-minimized")) {
          setDockMinimized(false);
        }
        toggleUploadDrawer(true);
        fileInput.click();
        return;
      }
      if (prompt) sendMessage(prompt);
    });
  });

  // 7b. Sự kiện click vào các Quick Action Chips (LucianLabs Prompt Dock)
  const slashPopup = document.getElementById("slashPopup");
  const slashItems = Array.from(document.querySelectorAll(".slash-item"));

  function executeSlashCommand(cmd) {
    if (slashPopup) slashPopup.classList.add("hidden");
    promptInput.value = "";
    promptInput.style.height = "auto";

    if (cmd === "/interactive") {
      setActiveMode("interactive");
      if (!state.documentText) {
        fileInput.click();
      } else {
        sendMessage("Hãy chuyển hóa toàn bộ tài liệu này thành một ỨNG DỤNG TƯƠNG TÁC ĐA MỐC (Interactive Timeline Scrubber): chia nhỏ thành 4-6 mốc cốt lõi theo dòng thời gian/bước tiến hóa/cấu trúc logic. Với mỗi mốc, nêu rõ: Thời kỳ, Bản chất cơ chế vận hành cặn kẽ, Công thức/Số liệu thực nghiệm, Khung cảnh trực quan sống động, và Ý nghĩa thực tiễn.");
      }
    } else if (cmd === "/slide") {
      setActiveMode("slides");
      sendMessage("Hãy thiết kế một bộ SLIDE THUYẾT TRÌNH BẢO VỆ ĐỀ TÀI hoàn chỉnh (5-7 slide) chuẩn layout Swiss Design kèm Speaker Notes chi tiết theo tài liệu hoặc chủ đề nghiên cứu học thuật.");
    } else if (cmd === "/paper") {
      setActiveMode("document");
      if (!state.documentText) {
        fileInput.click();
      } else {
        sendMessage("Hãy phân tích chuyên sâu, toàn diện và đa chiều tài liệu vừa tải lên: 1. Khung lý thuyết & khái niệm cốt lõi (kèm định nghĩa, cơ chế vận hành 'vì sao?'); 2. Phân tích chi tiết từng luận điểm/mô hình (triển khai chi tiết từng luận điểm với ít nhất 3-4 ý phụ, dẫn chứng thực tế hoặc công thức/số liệu); 3. Bảng so sánh tổng hợp (Markdown table); 4. Ý nghĩa thực tiễn và nhận xét đánh giá.");
      }
    } else if (cmd === "/ols") {
      setActiveMode("datascience");
      sendMessage("Giải thích bản chất ước lượng OLS, ma trận phương sai sai số thay đổi White và viết đoạn code Python mô phỏng bằng statsmodels.");
    } else if (cmd === "/math") {
      setActiveMode("exercise");
      sendMessage("Cho hàm sản xuất Cobb-Douglas Y = A * K^alpha * L^(1-alpha), hãy chứng minh lợi tức không đổi theo quy mô từng bước bằng tư duy First Principles.");
    } else if (cmd === "/quiz") {
      setActiveMode("quiz");
      sendMessage("Hãy tạo 5 câu hỏi trắc nghiệm chuyên sâu có 4 đáp án (A,B,C,D) kèm giải thích chi tiết và bộ Flashcard ôn thi nhanh.");
    }
  }

  // Click vào các Action Chips
  document.querySelectorAll(".chip-btn").forEach((chip) => {
    chip.addEventListener("click", () => {
      const act = chip.dataset.action;
      if (act === "interactive") {
        executeSlashCommand("/interactive");
      } else if (act === "slide") {
        executeSlashCommand("/slide");
      } else if (act === "paper") {
        executeSlashCommand("/paper");
      } else if (act === "ols") {
        executeSlashCommand("/ols");
      } else if (act === "math") {
        executeSlashCommand("/math");
      } else if (act === "quiz") {
        executeSlashCommand("/quiz");
      }
    });
  });

  // Click vào từng mục trong Slash Popup
  slashItems.forEach(item => {
    item.addEventListener("click", () => {
      executeSlashCommand(item.dataset.cmd);
    });
  });

  // 8. Phím tắt & Nút điều khiển
  sendBtn.addEventListener("click", () => sendMessage());

  promptInput.addEventListener("keydown", (e) => {
    const isPopupOpen = slashPopup && !slashPopup.classList.contains("hidden");

    if (isPopupOpen) {
      const visibleItems = slashItems.filter(it => it.style.display !== "none");
      let activeIdx = visibleItems.findIndex(it => it.classList.contains("active"));

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (visibleItems.length > 0) {
          if (activeIdx >= 0) visibleItems[activeIdx].classList.remove("active");
          const nextIdx = (activeIdx + 1) % visibleItems.length;
          visibleItems[nextIdx].classList.add("active");
          visibleItems[nextIdx].scrollIntoView({ block: "nearest" });
        }
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (visibleItems.length > 0) {
          if (activeIdx >= 0) visibleItems[activeIdx].classList.remove("active");
          const prevIdx = (activeIdx - 1 + visibleItems.length) % visibleItems.length;
          visibleItems[prevIdx].classList.add("active");
          visibleItems[prevIdx].scrollIntoView({ block: "nearest" });
        }
        return;
      } else if (e.key === "Escape") {
        e.preventDefault();
        slashPopup.classList.add("hidden");
        return;
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (visibleItems.length > 0 && activeIdx >= 0) {
          e.preventDefault();
          executeSlashCommand(visibleItems[activeIdx].dataset.cmd);
          return;
        }
      }
    }

    if ((e.key === "Enter" || e.keyCode === 13) && !e.shiftKey) {
      e.preventDefault();
      if (isPopupOpen) slashPopup.classList.add("hidden");
      sendMessage();
    }
  });

  promptInput.addEventListener("input", () => {
    promptInput.style.height = "auto";
    promptInput.style.height = Math.min(promptInput.scrollHeight, 160) + "px";

    const val = promptInput.value;
    if (slashPopup) {
      if (val.startsWith("/")) {
        slashPopup.classList.remove("hidden");
        const query = val.toLowerCase();
        let matchedFirst = false;

        slashItems.forEach(item => {
          const cmd = item.dataset.cmd.toLowerCase();
          const matches = cmd.startsWith(query) || cmd.includes(query.replace("/", ""));
          item.style.display = matches ? "flex" : "none";
          item.classList.remove("active");
          if (matches && !matchedFirst) {
            item.classList.add("active");
            matchedFirst = true;
          }
        });
      } else {
        slashPopup.classList.add("hidden");
      }
    }
  });

  function resetWorkspace() {
    state.messages = [];
    chatStream.innerHTML = "";
    heroSection.classList.remove("collapsed");
  }

  clearChatBtn.addEventListener("click", resetWorkspace);
  resetHomeBtn.addEventListener("click", resetWorkspace);

  themeToggleBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
  });

  // Modals
  openSettingsBtn.addEventListener("click", () => settingsModal.classList.remove("hidden"));
  closeSettingsBtn.addEventListener("click", () => settingsModal.classList.add("hidden"));
  tempInput.addEventListener("input", (e) => {
    state.temperature = parseFloat(e.target.value);
    tempVal.textContent = state.temperature;
  });
  ctxInput.addEventListener("change", (e) => {
    state.numCtx = parseInt(e.target.value, 10);
    ctxVal.textContent = state.numCtx;
  });
  maxTokensInput.addEventListener("input", (e) => {
    state.maxTokens = parseInt(e.target.value, 10);
    maxTokensVal.textContent = state.maxTokens;
  });

  openShareBtn.addEventListener("click", async () => {
    shareModal.classList.remove("hidden");
    const shareQrImg = document.getElementById("shareQrImg");
    try {
      const res = await fetch("/api/tunnel_info");
      const data = await res.json();
      localUrlText.textContent = data.local_url || "http://127.0.0.1:5000";
      tunnelUrlText.textContent = data.tunnel_url || "Chưa bật share_tunnel.py";
      const baseTarget = data.tunnel_url || data.local_url || "http://127.0.0.1:5000";
      const sep = baseTarget.includes("?") ? "&" : "?";
      const qrTarget = `${baseTarget}${sep}src=qr`;
      if (shareQrImg) {
        shareQrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=148x148&data=${encodeURIComponent(qrTarget)}`;
        shareQrImg.style.display = "block";
      }
    } catch (_) {}
  });
  closeShareBtn.addEventListener("click", () => shareModal.classList.add("hidden"));

  // Xử lý nút Sao chép link chia sẻ Cloudflare Tunnel
  document.querySelectorAll(".copy-url-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;
      const val = targetEl.textContent.trim();
      if (!val || val.includes("...") || val.includes("Chưa bật")) {
        alert("Đường link Cloudflare Tunnel chưa sẵn sàng hoặc chưa bật share_tunnel.py.");
        return;
      }
      navigator.clipboard.writeText(val).then(() => {
        const orig = btn.textContent;
        btn.textContent = "Đã chép link ✓";
        setTimeout(() => { btn.textContent = orig; }, 2000);
      }).catch(() => {
        btn.textContent = "Lỗi chép";
      });
    });
  });

  // 9. LucianLabs Interactive 3D Parallax on Workspace Layers
  const heroTrack = document.querySelector(".hero-track");
  const workspaceVisual = document.querySelector(".workspace-visual");
  if (heroTrack && workspaceVisual) {
    let mouseX = 0, mouseY = 0;
    let targetX = 0, targetY = 0;
    let animationFrameId = null;

    heroTrack.addEventListener("mousemove", (e) => {
      const rect = heroTrack.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      targetX = x * 18;
      targetY = y * 18;

      if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(updateParallax);
      }
    });

    heroTrack.addEventListener("mouseleave", () => {
      targetX = 0;
      targetY = 0;
      if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(updateParallax);
      }
    });

    function updateParallax() {
      mouseX += (targetX - mouseX) * 0.08;
      mouseY += (targetY - mouseY) * 0.08;

      const layerFront = document.querySelector(".layer-front");
      const layerMiddle = document.querySelector(".layer-middle");
      const layerBack = document.querySelector(".layer-back");

      if (layerFront) {
        layerFront.style.transform = `translate3d(${mouseX * 0.8}px, ${mouseY * 0.8}px, 20px) rotateX(${7 - mouseY * 0.3}deg) rotateY(${-16 + mouseX * 0.3}deg) rotateZ(-7deg)`;
      }
      if (layerMiddle) {
        layerMiddle.style.transform = `translate3d(${mouseX * -0.5}px, ${mouseY * -0.5}px, 0px) rotateX(${7 - mouseY * 0.2}deg) rotateY(${-16 + mouseX * 0.2}deg) rotateZ(9deg)`;
      }
      if (layerBack) {
        layerBack.style.transform = `translate3d(${mouseX * -0.9}px, ${mouseY * -0.9}px, -20px) rotateX(${7 - mouseY * 0.15}deg) rotateY(${-16 + mouseX * 0.15}deg) rotateZ(-12deg)`;
      }

      if (Math.abs(targetX - mouseX) > 0.01 || Math.abs(targetY - mouseY) > 0.01) {
        animationFrameId = requestAnimationFrame(updateParallax);
      } else {
        animationFrameId = null;
      }
    }
  }

  // Khởi chạy
  loadModels();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderStaticHeroMath);
  } else {
    renderStaticHeroMath();
  }
})();