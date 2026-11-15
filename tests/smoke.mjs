import { chromium, devices } from 'playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const failures = [];

async function runProfile(name, contextOptions) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => failures.push(`[${name}] JS: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !/supabase|favicon/i.test(message.text()))
      failures.push(`[${name}] console: ${message.text()}`);
  });
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('#introEnterBtn').waitFor({ state: 'visible' });
    await page.locator('#introEnterBtn').click();
    await page.waitForFunction(() => document.querySelector('#introScreen')?.classList.contains('intro-dismissed'));
    await page.locator('#openTicTacToe').click();
    await page.waitForFunction(() => document.body.classList.contains('view-tictactoe'));
    await page.locator('#attractionsBack').click();
    await page.locator('#openSoccer').click();
    await page.waitForFunction(() => document.body.classList.contains('view-soccer'));
    await page.locator('#soccerTrain').click();
    await page.waitForFunction(() => !document.querySelector('#soccerPlay').classList.contains('hidden'));
    const soccerDots = await page.locator('#soccerBoard [data-soccer-point]').count();
    if (soccerDots < 2) failures.push(`[${name}] Boisko nie wygenerowało punktów do gry.`);
    await page.locator('#soccerExit').click();
    await page.locator('#openHangman').click();
    await page.waitForFunction(() => document.body.classList.contains('view-mors-zone'));
    const letters = page.locator('#hangmanKeyboard button:not(:disabled)');
    if (await letters.count() < 10) failures.push(`[${name}] Klawiatura Urzędu Ostatecznej Litery nie działa.`);
    else await letters.first().click();
    await page.locator('#openMorsZone').click();
    await page.locator('#paintStart').click();
    await page.waitForFunction(() => !document.querySelector('#paintPlay').classList.contains('hidden'));
    const paintOptions = page.locator('#paintChoices button');
    if (await paintOptions.count() !== 4) failures.push(`[${name}] Gra Morścisław kontra Plama nie pokazuje czterech kolorów.`);
    await page.locator('#openFortune').click();
    await page.waitForFunction(() => document.body.classList.contains('view-fortune'));
    await page.locator('#openMorsZone').click();
    await page.locator('#fontStart').click();
    await page.waitForFunction(() => !document.querySelector('#fontPlay').classList.contains('hidden'));
    if (await page.locator('#fontChoices button').count() < 4) failures.push(`[${name}] Fontowy Bałagan nie generuje odpowiedzi.`);
  } catch (error) {
    failures.push(`[${name}] TEST: ${error.message}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

await runProfile('desktop', { viewport: { width: 1365, height: 900 } });
await runProfile('mobile', { ...devices['iPhone 13'] });
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('OK: ekran startowy, menu, kółko i krzyżyk, Mors Cup, Urząd Litery, Park Absurdu, Fontowy Bałagan — desktop + mobile.');
