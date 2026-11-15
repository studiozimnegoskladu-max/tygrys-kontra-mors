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
    await page.locator('#cpuBtn').click();
    await page.locator('#board .cell').first().click();
    await page.waitForTimeout(350);
    const cpuMarks = await page.locator('#board .cell').evaluateAll(cells => cells.filter(c => c.textContent.trim() || c.querySelector('img,svg,span')).length);
    if (cpuMarks < 1) failures.push(`[${name}] Ruch w kółko i krzyżyk nie został narysowany.`);
    await page.locator('#attractionsBack').click();
    await page.locator('#openSoccer').click();
    await page.waitForFunction(() => document.body.classList.contains('view-soccer'));
    await page.locator('#soccerTrain').click();
    await page.waitForFunction(() => !document.querySelector('#soccerPlay').classList.contains('hidden'));
    const soccerDots = page.locator('#soccerBoard [data-soccer-point]');
    if (await soccerDots.count() < 2) failures.push(`[${name}] Boisko nie wygenerowało punktów do gry.`);
    else { await soccerDots.first().click(); await page.waitForTimeout(120); if (await page.locator('#soccerBoard [data-soccer-point]').count() < 2) failures.push(`[${name}] Ruch na boisku nie odświeżył planszy.`); }
    await page.locator('#soccerExit').click();
    await page.locator('#openHangman').click();
    await page.waitForFunction(() => document.body.classList.contains('view-mors-zone'));
    const letters = page.locator('#hangmanKeyboard button:not(:disabled)');
    if (await letters.count() < 10) failures.push(`[${name}] Klawiatura Urzędu Ostatecznej Litery nie działa.`);
    else await letters.first().click();
    await page.locator('#paintStart').click();
    await page.waitForFunction(() => !document.querySelector('#paintPlay').classList.contains('hidden'));
    const paintOptions = page.locator('#paintChoices button');
    if (await paintOptions.count() !== 4) failures.push(`[${name}] Gra Morścisław kontra Plama nie pokazuje czterech kolorów.`);
    else await paintOptions.first().click();
    await page.locator('#herringStart').click();
    await page.waitForFunction(() => !document.querySelector('#herringPlay').classList.contains('hidden'));
    if (await page.locator('#herringChoices').locator('button').count() < 1) failures.push(`[${name}] Gra w uciekające śledzie nie wygenerowała celów.`);
    await page.locator('#fontStart').click();
    await page.waitForFunction(() => !document.querySelector('#fontPlay').classList.contains('hidden'));
    if (await page.locator('#fontChoices button').count() < 4) failures.push(`[${name}] Fontowy Bałagan nie generuje odpowiedzi.`);
    await page.locator('#attractionsBack').click();
    await page.locator('#openFortune').click();
    await page.waitForFunction(() => document.body.classList.contains('view-fortune'));
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
console.log('OK: ekran startowy, menu, ruch w kółko i krzyżyk, Mors Cup, Urząd Litery, trzy minigry Parku Absurdu, Fontowy Bałagan i Koło Fortuny — desktop + mobile.');
