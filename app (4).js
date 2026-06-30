// ===================== تنظیمات قابل ویرایش =====================
const CONFIG = {
  // وقتی API گوگل شیت آماده شد، آدرس آن را اینجا بگذارید (مثلا خروجی SheetDB)
  // اگر خالی بماند، از فایل data.json محلی استفاده می‌شود
  DATA_API_URL: "",
  LOCAL_DATA_FALLBACK: "data.json",

  // شماره واتساپ و تماس خودتان را اینجا وارد کنید.
  // فرمت آزاد است؛ می‌توانید با 0 شروع کنید یا با +98 یا بدون هیچ‌کدام - کد خودش اصلاح می‌کند.
  WHATSAPP_NUMBER_RAW: "+989375026963",
  CALL_NUMBER_RAW: "+989375026963",

  EMAIL_ADDRESS: "kaedistacompany@gmail.com",
  WEBSITE_URL: "https://plum-norma-17.tiiny.site"
};
// =================================================================

// تبدیل هر فرمتی از شماره ایرانی به فرمت استاندارد بین‌المللی
function normalizeIranNumber(raw) {
  let digits = String(raw).replace(/\D/g, ""); // فقط ارقام را نگه‌دار
  if (digits.startsWith("0")) {
    digits = "98" + digits.slice(1);
  } else if (!digits.startsWith("98")) {
    digits = "98" + digits;
  }
  return digits; // مثال خروجی: 989375026963
}

const WHATSAPP_NUMBER = normalizeIranNumber(CONFIG.WHATSAPP_NUMBER_RAW);
const CALL_NUMBER = "+" + normalizeIranNumber(CONFIG.CALL_NUMBER_RAW);

let deferredInstallPrompt = null;
let lastLoadedProducts = [];

document.addEventListener("DOMContentLoaded", () => {
  loadData();
  setupGenericContactLinks();
  setupInstallFlow();
  registerServiceWorker();
  setupLeadPill();
});

async function loadData() {
  let payload = null;
  try {
    if (CONFIG.DATA_API_URL) {
      const res = await fetch(CONFIG.DATA_API_URL);
      payload = await res.json();
    } else {
      const res = await fetch(CONFIG.LOCAL_DATA_FALLBACK);
      payload = await res.json();
    }
  } catch (err) {
    console.error("خطا در دریافت اطلاعات قیمت:", err);
    return;
  }

  const products = Array.isArray(payload.products) ? payload.products : [];
  lastLoadedProducts = products;
  document.getElementById("updated-at").textContent = `آخرین بروزرسانی: ${payload.updated_at || "-"}`;

  renderProductNav(products);
  renderProducts(products);
  loadHistoryAndRenderCharts(products);
  populateLeadProductOptions(products);
}

// ---- تاریخچه قیمت و نمودار ----
async function loadHistoryAndRenderCharts(products) {
  let history = [];
  try {
    const res = await fetch("history.json", { cache: "no-store" });
    history = await res.json();
  } catch (err) {
    console.error("خطا در دریافت تاریخچه قیمت:", err);
    return;
  }

  if (!Array.isArray(history) || history.length < 2) {
    // با کمتر از ۲ نقطه، نمودار معنی‌داری نیست
    return;
  }

  if (typeof Chart === "undefined") {
    console.warn("Chart.js در دسترس نیست؛ نمودار رسم نشد.");
    return;
  }

  products.forEach((product) => {
    renderProductCharts(product, history);
  });
}

// قیمت می‌تواند عدد، بازه‌ی رشته‌ای ("385000-410000") یا صفر/خالی (یعنی هنوز ثبت نشده) باشد
function parsePriceValue(price) {
  if (price === null || price === undefined) return null;
  if (typeof price === "number") {
    return price > 0 ? price : null;
  }
  if (typeof price === "string") {
    const trimmed = price.trim();
    if (!trimmed) return null;
    const rangeMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
    if (rangeMatch) {
      const a = parseFloat(rangeMatch[1]);
      const b = parseFloat(rangeMatch[2]);
      return (a + b) / 2;
    }
    const num = parseFloat(trimmed.replace(/,/g, ""));
    return isNaN(num) || num <= 0 ? null : num;
  }
  return null;
}

function renderProductCharts(product, history) {
  const container = document.getElementById(`charts-container-${product.id}`);
  if (!container) return;
  container.innerHTML = "";

  // واحدهای مختلف (تومان/کیلوگرم در برابر دلار/تن) هرگز در یک نمودار با هم نباشند
  const unitOrder = [];
  const labelsByUnit = {};
  (product.prices || []).forEach((pr) => {
    const unit = pr.unit || "نامشخص";
    const label = pr.label || "قیمت";
    if (!labelsByUnit[unit]) {
      labelsByUnit[unit] = [];
      unitOrder.push(unit);
    }
    if (!labelsByUnit[unit].includes(label)) labelsByUnit[unit].push(label);
  });

  // تاریخ‌های موجود در تاریخچه برای این محصول (برچسب فارسی/جلالی برای محور افق)
  const dateLabels = history.map((entry) => entry.date_fa || entry.date);

  unitOrder.forEach((unit, unitIdx) => {
    const labels = labelsByUnit[unit];
    const palette = ["#15140F", "#B5862B", "#6B7280", "#9CA3AF"];

    const datasets = labels.map((label, idx) => {
      const values = [];
      const rawValues = [];
      history.forEach((entry) => {
        const hp = (entry.products || []).find((p) => p.id === product.id);
        const hPrice = hp ? (hp.prices || []).find((pr) => (pr.label || "قیمت") === label) : null;
        rawValues.push(hPrice ? hPrice.price : null);
        values.push(hPrice ? parsePriceValue(hPrice.price) : null);
      });
      return {
        label,
        data: values,
        rawValues,
        borderColor: palette[idx % palette.length],
        backgroundColor: palette[idx % palette.length],
        spanGaps: true,
        tension: 0.25,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: false
      };
    });

    // اگر هیچ خطی حداقل ۲ نقطه‌ی واقعی نداشت، این نمودار را اصلاً نشان نده
    const hasEnoughData = datasets.some(
      (ds) => ds.data.filter((v) => v !== null).length >= 2
    );
    if (!hasEnoughData) return;

    const block = document.createElement("div");
    block.className = "chart-block";
    block.innerHTML = `
      <p class="chart-caption">روند قیمت — ${unit}</p>
      <canvas height="180"></canvas>
    `;
    container.appendChild(block);
    const canvasEl = block.querySelector("canvas");

    new Chart(canvasEl, {
      type: "line",
      data: { labels: dateLabels, datasets },
      options: {
        responsive: true,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: datasets.length > 1, labels: { font: { family: "Vazirmatn" } } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const raw = ctx.dataset.rawValues[ctx.dataIndex];
                const display = raw !== null && raw !== undefined ? formatNumber(raw) : "—";
                return `${ctx.dataset.label}: ${display}`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { font: { family: "Vazirmatn" } }
          },
          y: {
            beginAtZero: false,
            ticks: {
              font: { family: "IBM Plex Mono" },
              callback: (val) => formatNumber(val)
            }
          }
        }
      }
    });
  });
}

function formatNumber(n) {
  if (typeof n === "string") return n;
  return new Intl.NumberFormat("en-US").format(n);
}

function buildChangeBadge(price) {
  if (price.change_percent == null) return "";
  const dir = price.change_direction === "down" ? "down" : "up";
  const sign = dir === "down" ? "▼" : "▲";
  return `<span class="change-badge ${dir}">${sign} ${Math.abs(price.change_percent)}%</span>`;
}

// ---- نوار میانبر بین محصولات ----
function renderProductNav(products) {
  const nav = document.getElementById("product-nav");
  nav.innerHTML = "";
  if (products.length < 2) return;

  products.forEach((product) => {
    const pill = document.createElement("a");
    pill.href = `#product-${product.id}`;
    pill.className = "nav-pill";
    pill.textContent = product.name;
    nav.appendChild(pill);
  });
}

// ---- رندر همه محصولات ----
function renderProducts(products) {
  const wrap = document.getElementById("products-wrap");
  wrap.innerHTML = "";

  products.forEach((product) => {
    const section = document.createElement("section");
    section.className = "product-section";
    section.id = `product-${product.id}`;

    const priceCardsHtml = (product.prices || [])
      .map(
        (price) => `
        <div class="price-card">
          <div class="price-card-top">
            <span class="price-label">${price.label || ""}</span>
            ${buildChangeBadge(price)}
          </div>
          <div class="price-row">
            <span class="price-value">${formatNumber(price.price)}</span>
            <span class="price-unit">${price.unit || ""}</span>
          </div>
        </div>`
      )
      .join("");

    let mediaHtml = "";
    if (product.media_type === "video" && product.video_url) {
      mediaHtml = `<div class="media-block"><video src="${product.video_url}" controls playsinline></video></div>`;
    } else if (product.image_url) {
      mediaHtml = `<div class="media-block"><img src="${product.image_url}" alt="${product.name}" /></div>`;
    }

    section.innerHTML = `
      <div class="product-heading">
        <h2>${product.name}</h2>
        <p>${product.name_en || ""}</p>
      </div>
      <div class="prices-wrap">${priceCardsHtml}</div>
      <div class="charts-container" id="charts-container-${product.id}"></div>
      ${mediaHtml}
      ${product.description ? `<p class="description-block">${product.description}</p>` : ""}
      <a class="ask-product-btn" href="#" data-product-name="${product.name}">
        پرسش درباره ${product.name} در واتساپ ←
      </a>
    `;

    wrap.appendChild(section);
  });

  // اتصال دکمه‌های "پرسش درباره این محصول"
  document.querySelectorAll(".ask-product-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const productName = btn.getAttribute("data-product-name");
      const name = document.getElementById("lead-name").value;
      const phone = document.getElementById("lead-phone").value;
      const lines = [
        `سلام، در مورد قیمت "${productName}" سوال داشتم.`,
        name ? `نام: ${name}` : null,
        phone ? `شماره تماس: ${phone}` : null
      ].filter(Boolean);
      const text = encodeURIComponent(lines.join("\n"));
      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${text}`, "_blank");
    });
  });
}

// ---- دکمه‌های ارتباطی عمومی (پایین صفحه) ----
function setupGenericContactLinks() {
  const name = document.getElementById("lead-name");
  const phone = document.getElementById("lead-phone");
  const whatsappBtn = document.getElementById("whatsapp-btn");
  const callBtn = document.getElementById("call-btn");
  const emailBtn = document.getElementById("email-btn");
  const websiteBtn = document.getElementById("website-btn");

  callBtn.href = `tel:${CALL_NUMBER}`;
  if (websiteBtn) websiteBtn.href = CONFIG.WEBSITE_URL;

  function buildMessageLines() {
    return [
      "سلام، در مورد قیمت محصولات سوال داشتم.",
      name.value ? `نام: ${name.value}` : null,
      phone.value ? `شماره تماس: ${phone.value}` : null
    ].filter(Boolean);
  }

  function buildWhatsappHref() {
    const text = encodeURIComponent(buildMessageLines().join("\n"));
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
  }

  function buildEmailHref() {
    const subject = encodeURIComponent("استعلام قیمت محصولات");
    const body = encodeURIComponent(buildMessageLines().join("\n"));
    return `mailto:${CONFIG.EMAIL_ADDRESS}?subject=${subject}&body=${body}`;
  }

  // مقداردهی فوری (نباید منتظر دریافت داده بماند)
  whatsappBtn.href = buildWhatsappHref();
  whatsappBtn.addEventListener("click", () => { whatsappBtn.href = buildWhatsappHref(); });

  emailBtn.href = buildEmailHref();
  emailBtn.addEventListener("click", () => { emailBtn.href = buildEmailHref(); });
}

// ===================== نصب PWA =====================
function setupInstallFlow() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if (isStandalone) return;

  if (isIOS) {
    document.getElementById("ios-guide").classList.add("visible");
    return;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    document.getElementById("install-card").classList.add("visible");
  });

  document.getElementById("install-action").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById("install-card").classList.remove("visible");
  });

  window.addEventListener("appinstalled", () => {
    document.getElementById("install-card").classList.remove("visible");
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch((err) => {
      console.error("خطا در ثبت service worker:", err);
    });
  }
}

// ===================== دکمه شناور "بیشتر بدانید" + ارسال به تلگرام =====================

function populateLeadProductOptions(products) {
  const select = document.getElementById("lead-modal-product");
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = '<option value="">انتخاب کنید...</option>';
  products.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
  if (currentValue) select.value = currentValue;
}

function setupLeadPill() {
  const pill = document.getElementById("lead-pill");
  const overlay = document.getElementById("lead-modal-overlay");
  const cancelBtn = document.getElementById("lead-cancel-btn");
  const submitBtn = document.getElementById("lead-submit-btn");
  const statusEl = document.getElementById("lead-modal-status");

  if (!pill || !overlay) return;

  const SHOW_MS = 6000;
  const HIDE_MS = 20000;

  function cycle() {
    pill.classList.add("show");
    setTimeout(() => {
      pill.classList.remove("show");
      setTimeout(cycle, HIDE_MS);
    }, SHOW_MS);
  }
  // کمی تاخیر در شروع تا با بنر اطلاعیه تداخل نداشته باشد
  setTimeout(cycle, 4000);

  function openModal() {
    pill.classList.remove("show");
    overlay.classList.add("show");
    statusEl.textContent = "";
    statusEl.className = "";
  }
  function closeModal() {
    overlay.classList.remove("show");
  }

  pill.addEventListener("click", openModal);
  cancelBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  submitBtn.addEventListener("click", () => {
    const name = document.getElementById("lead-modal-name").value.trim();
    const phone = document.getElementById("lead-modal-phone").value.trim();
    const product = document.getElementById("lead-modal-product").value;

    if (!name || !phone || !product) {
      statusEl.textContent = "لطفاً نام، شماره تماس و محصول را وارد کنید.";
      statusEl.className = "error";
      return;
    }

    const text =
      `درخواست اطلاعات بیشتر\n` +
      `نام: ${name}\n` +
      `شماره تماس: ${phone}\n` +
      `محصول مورد علاقه: ${product}`;

    // باز کردن اپ پیامک خود کاربر با متن و شماره از پیش پر شده.
    // این روش به اینترنت یا هیچ سرویس خارجی وابسته نیست و همیشه کار می‌کند.
    const smsNumber = CONFIG.CALL_NUMBER_RAW.replace(/\D/g, "");
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const separator = isIOS ? "&" : "?";
    const smsUrl = `sms:${smsNumber}${separator}body=${encodeURIComponent(text)}`;

    window.location.href = smsUrl;

    statusEl.textContent = "اپ پیامک باز شد؛ لطفاً پیام را ارسال کنید.";
    statusEl.className = "success";
    setTimeout(closeModal, 2200);
  });
}
