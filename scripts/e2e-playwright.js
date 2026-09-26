/**
 * Verifikasi UI end-to-end dengan browser sungguhan (Playwright + Chromium).
 * Jalankan manual: node scripts/e2e-playwright.js (server dev harus jalan di :3000)
 */
const { chromium } = require("playwright");

const BASE_URL = "http://localhost:3000";

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
  });
  const page = await browser.newPage();
  let pass = 0;
  let fail = 0;
  const ok = (msg) => {
    pass++;
    console.log(`  PASS - ${msg}`);
  };
  const bad = (msg) => {
    fail++;
    console.log(`  FAIL - ${msg}`);
  };

  const tanggalKirim = tomorrow();

  try {
    console.log("[1] Login admin & buka kuota untuk besok");
    await page.goto(`${BASE_URL}/login`);
    await page.fill("input", "admin");
    await page.fill('input[type="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE_URL}/dashboard`, { timeout: 10000 });
    ok("Berhasil login admin dan redirect ke /dashboard");

    await page.fill('input[type="date"]', tanggalKirim);
    await page.click('button:has-text("Buka Semua Menu")');
    try {
      await page.waitForFunction(() => document.body.textContent.includes("Sudah dibuka"), {
        timeout: 8000,
      });
      ok("Kuota berhasil dibuka untuk semua menu aktif pada tanggal besok");
    } catch {
      bad("Kuota tidak menunjukkan status 'Sudah dibuka' setelah klik buka semua");
    }

    console.log("[2] Logout, buka /order publik, cek sisa kuota live");
    await page.click("text=Logout");
    await page.waitForURL(`${BASE_URL}/login`, { timeout: 10000 });
    await page.goto(`${BASE_URL}/order`);
    await page.fill('input[type="date"]', tanggalKirim);
    try {
      await page.waitForFunction(() => document.body.textContent.includes("Sisa kuota:"), {
        timeout: 8000,
      });
      ok("Halaman /order menampilkan sisa kuota live untuk tanggal yang dipilih");
    } catch {
      bad("Halaman /order tidak menampilkan sisa kuota");
    }

    console.log("[3] Buat order (pilih 2 porsi menu pertama)");
    const qtyInputs = await page.$$('input[type="number"]');
    await qtyInputs[0].fill("2");
    const formInputs = await page.$$("form input:not([type=number]):not([type=date])");
    await formInputs[0].fill("E2E Pelanggan");
    await formInputs[1].fill("081388887777");
    await page.fill("textarea", "Jl. E2E Testing No. 1");
    await page.click('button:has-text("Pesan")');
    try {
      await page.waitForFunction(() => document.body.textContent.includes("Order berhasil dibuat"), {
        timeout: 8000,
      });
      ok("Order berhasil dibuat lewat halaman publik /order");
    } catch {
      const body = await page.textContent("body");
      bad(`Order gagal dibuat: ${body.slice(0, 200)}`);
    }

    console.log("[4] Login lagi, cek tab Order Masuk & Rekap Belanja");
    await page.goto(`${BASE_URL}/login`);
    await page.fill("input", "admin");
    await page.fill('input[type="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE_URL}/dashboard`, { timeout: 10000 });

    await page.click('button:has-text("Order Masuk")');
    await page.fill('input[type="date"]', tanggalKirim);
    try {
      await page.waitForFunction(() => document.body.textContent.includes("E2E Pelanggan"), {
        timeout: 8000,
      });
      ok("Order yang baru dibuat muncul di tab Order Masuk admin");
    } catch {
      bad("Order baru tidak muncul di tab Order Masuk");
    }

    await page.click('button:has-text("Rekap Belanja")');
    const dateInputs = await page.$$('input[type="date"]');
    await dateInputs[0].fill(tanggalKirim);
    await dateInputs[1].fill(tanggalKirim);
    await page.click('button:has-text("Hitung Rekap")');
    try {
      await page.waitForFunction(
        () => !document.body.textContent.includes("Belum ada data") && /\d/.test(document.body.textContent),
        { timeout: 8000 }
      );
      ok("Tab Rekap Belanja menampilkan hasil kebutuhan bahan baku");
    } catch {
      bad("Tab Rekap Belanja tidak menampilkan data");
    }
  } catch (e) {
    bad(`Exception selama test: ${e.message}`);
  }

  await browser.close();
  console.log(`\n=== Hasil E2E: ${pass} PASS, ${fail} FAIL ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
