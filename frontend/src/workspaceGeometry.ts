/** Remove decorative preset furniture from the MuJoCo configuration, not just the view. */
export function cleanPresetGeometry(config:Record<string,unknown>):Record<string,unknown>{
 const environment=config.environment;
 if(!environment||typeof environment!=='object'||(environment as Record<string,unknown>).source!=='prebuilt'||!Array.isArray(config.scene_geometries))return config;
 const simplePickup=config.physical_operation==='pick_place';
 return {...config,scene_geometries:config.scene_geometries.filter(item=>{
  if(!item||typeof item!=='object')return true;
  const name=(item as Record<string,unknown>).name;
  if(name==='back_wall'||name==='cabinet'||(typeof name==='string'&&name.startsWith('rack_')))return false;
  return !simplePickup||name==='floor'||name==='collision_fixture';
 })};
}
