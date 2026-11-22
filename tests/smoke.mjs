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
    if (message.type() === 'error' && !/supabase|favicon|Failed to load resource/i.test(message.text()))
      failures.push(`[${name}] console: ${message.text()}`);
  });
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('#introEnterBtn').waitFor({ state: 'visible' });
    await page.waitForFunction(() => window.supabase?.createClient, { timeout: 15000 });
    const onlineCheck = await page.evaluate(async () => {
      const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const seasons = await client.from('morscup_seasons').select('id,status').eq('status','active').limit(1);
      const ttt = await client.rpc('szs_secure_get_room', { p_room_code: 'ZZZZZZZZZZZZ', p_player_token: 'smoke-test-invalid-token' });
      const soccer = await client.rpc('szs_soccer_get_room', { p_room_code: 'ZZZZZZZZ', p_player_token: 'smoke-test-invalid-token' });
      return { seasonError: seasons.error?.message || null, activeSeasons: seasons.data?.length || 0, tttError: ttt.error?.message || null, soccerError: soccer.error?.message || null };
    });
    if (onlineCheck.seasonError || onlineCheck.activeSeasons < 1) failures.push(`[${name}] Supabase nie udostępnia aktywnego sezonu ligi: ${onlineCheck.seasonError || 'brak aktywnego sezonu'}`);
    if (!onlineCheck.tttError || /Could not find the function|schema cache/i.test(onlineCheck.tttError)) failures.push(`[${name}] RPC pokoju kółko i krzyżyk nie odpowiada prawidłowo.`);
    if (!onlineCheck.soccerError || /Could not find the function|schema cache/i.test(onlineCheck.soccerError)) failures.push(`[${name}] RPC pokoju Mors Cup nie odpowiada prawidłowo.`);
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
    else { await soccerDots.first().click(); await page.waitForFunction(() => !document.querySelector('#soccerStatus')?.textContent.includes('Morścisław myśli'), { timeout: 5000 }); if (await page.locator('#soccerBoard [data-soccer-point]').count() < 2) failures.push(`[${name}] Ruch na boisku nie odświeżył planszy po ruchu przeciwnika.`); }
    await page.locator('#soccerExit').click();
    await page.locator('#openHangman').click();
    await page.waitForFunction(() => document.body.classList.contains('view-hangman'));
    const letters = page.locator('#hangmanKeyboard button:not(:disabled)');
    if (await letters.count() < 10) failures.push(`[${name}] Klawiatura Urzędu Ostatecznej Litery nie działa.`);
    else await letters.first().click();
    await page.locator('#attractionsBack').click();
    await page.locator('#openMorsZone').click();
    await page.waitForFunction(() => document.body.classList.contains('view-mors-zone'));
    await page.locator('#paintStart').click();
    await page.waitForFunction(() => !document.querySelector('#paintPlay').classList.contains('hidden'));
    const paintOptions = page.locator('#paintChoices button');
    if (await paintOptions.count() !== 4) failures.push(`[${name}] Gra Morścisław kontra Plama nie pokazuje czterech kolorów.`);
    else await paintOptions.first().click();
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
console.log('OK: ekran startowy, menu, ruch w kółko i krzyżyk, Mors Cup, Urząd Litery, minigra Morścisław kontra Plama, Fontowy Bałagan i Koło Fortuny — desktop + mobile.');
