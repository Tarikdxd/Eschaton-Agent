const MODEL_MULTIPLIERS = {
  "claude-opus-4.6": 2.4,
  "gpt-5": 1.4,
  "claude-sonnet-4.6": 1.25,
  "gemini-3-pro": 1.0,
  "gemini-3-flash": 0.35,
};

const I18N = {
  tr: {
    eyebrow: "Evrensel Antigravity Co-Agent Köprüsü",
    heroTitle: "Qoder ve OpenCode’a bilgisayarındaki Antigravity’yi yardımcı ajan olarak ver.",
    heroLead:
      "Eschaton-Agent; herhangi bir dış yapay zeka ajanının yerel Antigravity masaüstü uygulamana bağlanmasını, doğru projeyi seçmesini, güncel benchmarklara göre en iyi modeli atamasını ve kotanı asla %10’un altına düşürmeden görev devretmesini sağlar.",
    ctaGithub: "GitHub Deposuna Git",
    ctaSim: "%10 Kalkanını Test Et",
    promptLabel: "Qoder / OpenCode / Claude Code’a Yapıştır:",
    promptText:
      "https://github.com/Tarikdxd/Eschaton-Agent reposunu kullanarak bilgisayarımdaki Antigravity'ye bağlan ve yardımcı ajan olarak kullan.",
    copyBtn: "Kopyala",
    copiedBtn: "Kopyalandı",
    archKicker: "Çekirdek Mimari",
    archTitle: "Dört katmanlı güvenli orkestrasyon",
    archDesc:
      "Dış ajan yalnızca repo linkini okur; Eschaton-Agent kurulumdan %10 kota korumasına kadar tüm köprüyü otonom yönetir.",
    p1Title: "Hibrit Electron CDP + UI Köprüsü",
    p1Desc:
      "Birincil olarak Antigravity’nin Electron CDP/DOM portu üzerinden fareyi meşgul etmeden arka planda çalışır; port kapalıysa UI otomasyonu yedeğine geçer.",
    p2Title: "Akıllı Proje / Workspace Seçici",
    p2Desc:
      "Dış ajanın çalıştığı dizini ve açık Antigravity pencerelerini tarayarak doğru projeyi otomatik eşleştirir, odaklar veya açar.",
    p3Title: "Canlı Benchmark Model Seçici",
    p3Desc:
      "SWE-bench Verified, Aider Polyglot, LMArena ve LiveCodeBench verilerini senkronize ederek her promptun görev tipine en uygun modeli seçer.",
    p4Title: "%10 Korumalı Token & Usage Kalkanı",
    p4Desc:
      "Gönderim öncesi token maliyetini hesaplar. Taşma riski veya %10 sınırını aşma ihtimali varsa promptu engeller, kotayı asla sıfırlamaz.",
    simKicker: "Canlı Simülasyon",
    simTitle: "%10 Usage Kalkanı Nasıl Karar Verir?",
    simDesc:
      "Kalan Antigravity kotasını, modeli ve prompt büyüklüğünü değiştirerek kalkanın ne zaman onay verdiğini, ne zaman ekonomi moduna geçtiğini ve ne zaman kesin kilit uyguladığını inceleyin.",
    intKicker: "Entegrasyon",
    intTitle: "MCP Sunucusu veya Doğrudan CLI",
    intDesc:
      "AGENTS.md, CLAUDE.md ve SKILL.md sayesinde dış ajanlar kurulum ve bağlantı protokolünü kendiliğinden anlar.",
    toolsKicker: "MCP Araçları",
    toolsTitle: "Dış Ajanlara Sunulan 5 Standart Araç",
  },
  en: {
    eyebrow: "Universal Antigravity Co-Agent Bridge",
    heroTitle: "Give Qoder & OpenCode direct access to your local Antigravity as a co-agent.",
    heroLead:
      "Eschaton-Agent lets any external AI agent connect to your running Antigravity desktop app, select the exact project workspace, route to the top benchmarked model for every prompt, and strictly lock usage at a 10% reserve floor.",
    ctaGithub: "View on GitHub",
    ctaSim: "Test the 10% Shield",
    promptLabel: "Paste into Qoder / OpenCode / Claude Code:",
    promptText:
      "Use https://github.com/Tarikdxd/Eschaton-Agent to connect to my local Antigravity desktop app and use it as your co-agent.",
    copyBtn: "Copy",
    copiedBtn: "Copied",
    archKicker: "Core Architecture",
    archTitle: "Four-layer autonomous orchestration",
    archDesc:
      "External agents simply read the repository link; Eschaton-Agent handles discovery, routing, and strict 10% quota protection.",
    p1Title: "Hybrid Electron CDP + UI Bridge",
    p1Desc:
      "Operates in the background over Antigravity's Electron CDP/DOM bridge without hijacking your mouse or keyboard, with graceful OS UI fallback.",
    p2Title: "Smart Project / Workspace Selector",
    p2Desc:
      "Scans your active directory, local repositories, and open Antigravity windows to match and focus the exact workspace.",
    p3Title: "Live Benchmark Model Router",
    p3Desc:
      "Syncs SWE-bench Verified, Aider Polyglot, LMArena, and LiveCodeBench signals to pick the highest-scoring available model for each task.",
    p4Title: "Strict 10% Token & Usage Shield",
    p4Desc:
      "Estimates prompt + context + expected output tokens before sending. Blocks overflows and hard-locks at 10% remaining usage.",
    simKicker: "Interactive Simulation",
    simTitle: "How the 10% Usage Shield Decides",
    simDesc:
      "Adjust remaining Antigravity quota, model choice, and prompt size to see live approval, economy-mode fallback, and hard 10% floor locking.",
    intKicker: "Integration",
    intTitle: "Standard MCP Server or Direct CLI",
    intDesc:
      "With AGENTS.md, CLAUDE.md, and SKILL.md at the repo root, external agents self-configure automatically.",
    toolsKicker: "MCP Tools",
    toolsTitle: "5 Standard Tools Exposed to External Agents",
  },
};

let currentLang = "tr";

function applyLanguage(lang) {
  currentLang = lang;
  const dict = I18N[lang];
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });
  const langBtn = document.getElementById("lang-toggle");
  if (langBtn) {
    langBtn.textContent = lang === "tr" ? "EN" : "TR";
  }
  updateSimulator();
}

function updateSimulator() {
  const remaining = parseFloat(document.getElementById("sim-remaining").value);
  const promptTokens = parseInt(document.getElementById("sim-tokens").value, 10);
  const model = document.getElementById("sim-model").value;

  document.getElementById("val-remaining").textContent = `${remaining.toFixed(1)}%`;
  document.getElementById("val-tokens").textContent = `${promptTokens.toLocaleString()} tok`;

  const fill = document.getElementById("quota-fill");
  fill.style.width = `${remaining}%`;

  const mult = MODEL_MULTIPLIERS[model] || 1.0;
  const expectedOut = Math.max(1500, promptTokens * 3.5 + 2500);
  const weighted = (promptTokens + expectedOut * 2.5) * mult;
  // Scale to 1,000,000 quota window for clear interactive demonstration
  const rawCostPct = Number(((weighted / 1_000_000) * 100).toFixed(2));

  const econWeighted = (promptTokens + expectedOut * 2.5) * 0.35;
  const econCostPct = Number(((econWeighted / 1_000_000) * 100).toFixed(2));

  const badge = document.getElementById("sim-badge");
  const mCost = document.getElementById("metric-cost");
  const mAfter = document.getElementById("metric-after");
  const mModel = document.getElementById("metric-model");
  const mAction = document.getElementById("metric-action");
  const reasonEl = document.getElementById("sim-reason");

  let statusClass = "status-ok";
  let badgeText = "OK — ALLOWED";
  let finalModel = model;
  let finalCost = rawCostPct;
  let projected = Number(Math.max(0, remaining - rawCostPct).toFixed(2));
  let actionText = currentLang === "tr" ? "Antigravity'ye Gönder" : "Deliver to Antigravity";
  let reason = "";

  if (remaining <= 10.0) {
    statusClass = "status-blocked";
    badgeText = "BLOCKED_FLOOR_10_PERCENT";
    fill.style.backgroundColor = "#b42318";
    finalModel = "—";
    actionText = currentLang === "tr" ? "KİLİTLENDİ (Gönderilmedi)" : "LOCKED (Not Sent)";
    reason =
      currentLang === "tr"
        ? `Kalan kota %${remaining.toFixed(1)} ile %10 koruma tabanında. Eschaton promptu kesin olarak engelledi.`
        : `Remaining quota (${remaining.toFixed(1)}%) is at or below the 10% floor. Prompt hard-blocked.`;
  } else if (remaining - rawCostPct < 10.0) {
    if (remaining - econCostPct >= 10.0 && model !== "gemini-3-flash") {
      statusClass = "status-economy";
      badgeText = "ECONOMY_MODE — AUTO SWITCH";
      fill.style.backgroundColor = "#d97706";
      finalModel = "gemini-3-flash";
      finalCost = econCostPct;
      projected = Number((remaining - econCostPct).toFixed(2));
      actionText = currentLang === "tr" ? "Ekonomi Modeliyle Gönder" : "Send via Economy Model";
      reason =
        currentLang === "tr"
          ? `'${model}' %10 sınırını aşacaktı (%${(remaining - rawCostPct).toFixed(2)}). Kalkan otomatik olarak 'gemini-3-flash' modeline geçti.`
          : `'${model}' would breach the 10% floor. Shield automatically switched to 'gemini-3-flash' to stay safe.`;
    } else {
      statusClass = "status-blocked";
      badgeText = "BLOCKED_PROJECTED_BREACH";
      fill.style.backgroundColor = "#b42318";
      actionText = currentLang === "tr" ? "ENGELLENDİ + Bölme Öner" : "BLOCKED + Suggest Split";
      reason =
        currentLang === "tr"
          ? `Bu prompt tahmini %${rawCostPct.toFixed(2)} harcayarak kotayı %10 altına düşürecekti. Prompt gönderilmedi; dış ajana küçük alt görev önerisi döndürüldü.`
          : `Prompt would spend ~${rawCostPct.toFixed(2)}% and breach the 10% floor. Blocked; split suggestion returned to caller agent.`;
    }
  } else if (remaining <= 15.0) {
    statusClass = "status-economy";
    badgeText = "ECONOMY_MODE — SAFE";
    fill.style.backgroundColor = "#d97706";
    finalModel = "gemini-3-flash";
    finalCost = econCostPct;
    projected = Number((remaining - econCostPct).toFixed(2));
    reason =
      currentLang === "tr"
        ? `%10–%15 bandında Ekonomi Modu devrede. 'gemini-3-flash' ile güvenli şekilde gönderilebilir.`
        : `Inside the 10%–15% reserve band. Economy Mode enforces 'gemini-3-flash' to preserve quota.`;
  } else {
    fill.style.backgroundColor = "#1f7a4c";
    reason =
      currentLang === "tr"
        ? `Güvenli bölge: '${model}' ile tahmini maliyet %${rawCostPct.toFixed(2)}, kalan kota %${projected.toFixed(2)} (> %10.0).`
        : `Safe zone: '${model}' estimated cost is ${rawCostPct.toFixed(2)}%, leaving ${projected.toFixed(2)}% (> 10.0%).`;
  }

  badge.className = `status-badge ${statusClass}`;
  badge.textContent = badgeText;
  mCost.textContent = `%${finalCost.toFixed(2)}`;
  mAfter.textContent = `%${projected.toFixed(2)}`;
  mModel.textContent = finalModel;
  mAction.textContent = actionText;
  reasonEl.textContent = reason;
}

function wireCopyButtons() {
  document.querySelectorAll("[data-copy-target]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetId = btn.getAttribute("data-copy-target");
      const target = document.getElementById(targetId);
      if (!target) return;
      try {
        await navigator.clipboard.writeText(target.textContent.trim());
        const prev = btn.textContent;
        btn.textContent = I18N[currentLang].copiedBtn;
        setTimeout(() => {
          btn.textContent = prev;
        }, 1600);
      } catch (_) {}
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("lang-toggle").addEventListener("click", () => {
    applyLanguage(currentLang === "tr" ? "en" : "tr");
  });

  ["sim-remaining", "sim-tokens", "sim-model"].forEach((id) => {
    document.getElementById(id).addEventListener("input", updateSimulator);
    document.getElementById(id).addEventListener("change", updateSimulator);
  });

  wireCopyButtons();
  applyLanguage("tr");
});
