import {defineConfig} from '@playwright/test';

export default defineConfig({
 testDir:'./e2e',testMatch:'import-task-cell.spec.ts',workers:1,timeout:120_000,
 expect:{timeout:30_000},reporter:'list',outputDir:'test-results/production-import',
 use:{baseURL:process.env.VIVACITY_IMPORT_BASE_URL??'https://demo.tryvivacity.com',
      viewport:{width:1440,height:1080},channel:process.platform==='win32'?'chrome':undefined,
      screenshot:'only-on-failure',trace:'retain-on-failure'},
});
