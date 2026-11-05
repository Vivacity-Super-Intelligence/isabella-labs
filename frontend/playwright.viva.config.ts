import {defineConfig} from '@playwright/test';

const engine=process.env.VIVACITY_VIVA_BROWSER;

export default defineConfig({
 testDir:'./e2e',testMatch:'viva-agent.spec.ts',workers:1,timeout:120_000,
 expect:{timeout:30_000},reporter:'list',outputDir:'test-results/viva',
 use:{baseURL:process.env.VIVACITY_VIVA_BASE_URL??'http://127.0.0.1:5185',
      viewport:{width:1440,height:900},
      ...(engine==='firefox'||engine==='webkit'?{browserName:engine}:{channel:process.platform==='win32'?'chrome':undefined}),
      screenshot:'only-on-failure',trace:'retain-on-failure'},
});
