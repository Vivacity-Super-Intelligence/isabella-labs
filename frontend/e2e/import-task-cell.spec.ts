import {test,expect} from '@playwright/test';

test('upload remains unjudged until a configured MuJoCo task is run',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/import');
  await expect(page.getByRole('button',{name:'Environment geometry',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Environment geometry',exact:true}).click();
  await page.getByLabel('Choose environment geometry').setInputFiles('../fixtures/imports/triangle.glb');
  await page.getByRole('button',{name:'Inspect geometry',exact:true}).click();
  await expect(page.getByRole('region',{name:'Imported static geometry preview'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).__vivacityImport?.physicsReady)).toBe(false);
  await page.getByRole('button',{name:'Robot or CAD',exact:true}).click();
  await page.getByLabel('Choose robot or CAD file').setInputFiles('../fixtures/imports/orbital_salvage_lab.zip');
  await page.getByRole('button',{name:'Stage in lab',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Ready to configure',exact:true})).toBeVisible();
  await expect(page.getByText('Nothing has been declared successful or failed yet.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Place in test cell',exact:true}).click();
  await expect(page.getByRole('button',{name:'Run configured task',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Run configured task',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Task succeeded',exact:true})).toBeVisible({timeout:60000});
  await expect(page.getByRole('heading',{name:'Configured MuJoCo task',exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).__vivacityTaskTrial?.source)).toBe('measured_mujoco');
  expect(errors).toEqual([]);
});
