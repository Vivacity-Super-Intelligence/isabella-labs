/** Remove the preset backdrop from the physical world itself. User-created geometry stays intact. */
export function withoutPresetBackWall(config:Record<string,unknown>):Record<string,unknown>{
 const environment=config.environment;
 if(!environment||typeof environment!=='object'||(environment as Record<string,unknown>).source!=='prebuilt'||!Array.isArray(config.scene_geometries))return config;
 return {...config,scene_geometries:config.scene_geometries.filter(item=>!item||typeof item!=='object'||(item as Record<string,unknown>).name!=='back_wall')};
}
