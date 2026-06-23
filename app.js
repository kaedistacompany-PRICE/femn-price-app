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
  return digits; // مثال خروجی: 989123456789
}

const WHATSAPP_NUMBER = normalizeIranNumber(CONFIG.WHATSAPP_NUMBER_RAW);
const CALL_NUMBER = "+" + normalizeIranNumber(CONFIG.CALL_NUMBER_RAW);

let deferredInstallPrompt = null;

document.addEventListener("DOMContentLoaded", () => {
  loadData();
  setupGenericContactLinks();
  setupInstallFlow();
  registerServiceWorker();
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
  document.getElementById("updated-at").textContent = `آخرین بروزرسانی: ${payload.updated_at || "-"}`;

  renderProductNav(products);
  renderProducts(products);
}

function formatNumber(n) {
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
