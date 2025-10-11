import { world, system, MolangVariableMap, BlockVolume } from "@minecraft/server";
import {
  portalSP,
  portalDP,
  ID,
  portalGunDP,
  PORTAL_MODES
} from "../utils/ids&variables";

export function calculateEuclideanDistance(location1, location2) {
  let deltaX = location1.x - location2.x;
  let deltaY = location1.y - location2.y;
  let deltaZ = location1.z - location2.z;
  let distance = Math.sqrt(deltaX ** 2 + deltaY ** 2 + deltaZ ** 2);
  return distance;
}

export function changePortalGunMode(player, inventory, portalGunItem, mode, removePortals = true) {
  portalGunItem.setDynamicProperty(portalGunDP.mode, mode);
  player.dimension.playSound("ram_portalgun:selection", player.location);
  if(removePortals)
    removeAllPortals(player, portalGunItem);
  inventory.container.setItem(player.selectedSlotIndex, portalGunItem);
}

export function spawnPortal(dimension, location, rotation, orientation, scale, ownerId) {
  const variables = new MolangVariableMap();
  if(orientation == 0){
    variables.setFloat("variable.ray_orientation", 1);
    if(rotation == 0 || rotation == 2){
      variables.setFloat("variable.x", 0);
      variables.setFloat("variable.z", 1);
    }
    else if(rotation == 1 || rotation == 3){
      variables.setFloat("variable.x", 1);
      variables.setFloat("variable.z", 0);
    }
  } else {
    variables.setFloat("variable.ray_orientation", 0);
    variables.setFloat("variable.x", 0);
    variables.setFloat("variable.z", 0);
  }

    const searchArea = {
      location: location,
      maxDistance: 1
    };
    const queryOptions = {
      ...searchArea,

      excludeTypes: ["minecraft:player", ID.portal] 
    };

  if(orientation == 0){
    const blockBelow = dimension.getBlock({ x: location.x, y: location.y - 1, z: location.z });
    if(scale == 1){
      if (blockBelow && blockBelow.typeId !== "minecraft:air") {
        location.y++;
      }
    } else if (scale > 1){
      if (blockBelow && blockBelow.typeId !== "minecraft:air") {
        location.y += 2;
      }
    }
  }

  let newPortal = dimension.spawnEntity(ID.portal, location);
  newPortal.setProperty(portalSP.rotation, rotation);
  newPortal.setProperty(portalSP.orientation, orientation);
  newPortal.setProperty(portalSP.scale, scale);
  newPortal.setDynamicProperty(portalDP.ownerPortalGun, ownerId);



  const entitiesToDamage = newPortal.dimension.getEntities(queryOptions);
  for (const entity of entitiesToDamage) entity.applyDamage(20);

  newPortal.dimension.spawnParticle("ram_portalgun:portal_ray_particle", newPortal.location, variables);
  return newPortal;
}

export function linkPortals(portalAId, portalBId) {
  const portalA = world.getEntity(portalAId);
  const portalB = world.getEntity(portalBId);
  if (portalA && portalB) {
    portalA.setDynamicProperty(portalDP.DualityPortalId, portalB.id);
    portalB.setDynamicProperty(portalDP.DualityPortalId, portalA.id);
  }
}

export function validatePortalList(portalGunItem, inventory, slotIndex) {
  const portalListJson = portalGunItem.getDynamicProperty(portalGunDP.portalList);
  let portalIds = portalListJson ? JSON.parse(portalListJson) : [];
  let validPortalIds = portalIds.filter(id => !!world.getEntity(id));
  if (validPortalIds.length !== portalIds.length) {
    portalGunItem.setDynamicProperty(portalGunDP.portalList, JSON.stringify(validPortalIds));
    inventory.container.setItem(slotIndex, portalGunItem);
  }
  return validPortalIds;
}

export function removePortal(player, portalEntity, mustRemoveDual = true) {
  const inventory = player.getComponent("inventory");
  const portalGunId = portalEntity.getDynamicProperty(portalDP.ownerPortalGun);
  const itemObject = findPortalGunInInventory(player, portalGunId);
  const portalGunItem = itemObject?.item;
  const portalListJson = portalGunItem?.getDynamicProperty(
    portalGunDP.portalList
  );
  let portalIds = portalListJson ? JSON.parse(portalListJson) : [];
  let animation_length = 0.46;
  const tickDelay = animation_length * 20;
  
  if(itemObject !== undefined){
    const currentMode = portalGunItem.getDynamicProperty(portalGunDP.mode);
  
    if ((currentMode == PORTAL_MODES.ROOT || currentMode == PORTAL_MODES.CUSTOM) && portalEntity.id == portalIds[0]) {
      removeAllPortals(player, portalGunItem, itemObject.slotIndex);
      return;
    }
  
    portalIds = portalIds.filter((id) => id !== portalEntity.id);
    
    if((currentMode == PORTAL_MODES.ROOT || currentMode == PORTAL_MODES.CUSTOM) && portalIds.length > 1){
      linkPortals(portalIds[0], portalIds[portalIds.length - 1]);
    }
  }
  
  if (mustRemoveDual) {
    let dualPortalID = portalEntity.getDynamicProperty(
      portalDP.DualityPortalId
    );
    if (dualPortalID) {
      let dualPortal = world.getEntity(dualPortalID);
      if(dualPortal){
        const dualTickingArea = dualPortal.getDynamicProperty(portalDP.tickingArea)
        const block = dualPortal.dimension.getBlock(dualPortal.location);
        const isInWater =
          block.typeId === "minecraft:water" ||
          block.typeId === "minecraft:flowing_water";
        const isInLava =
          block.typeId === "minecraft:lava" ||
          block.typeId === "minecraft:flowing_lava";
        if (isInWater || isInLava) {
          let dimension = dualPortal.dimension;
          let location = dualPortal.location;
          system.runTimeout(()=>{
            dimension.runCommand(
              `setblock ${location.x} ${location.y} ${location.z} air`
            );
          }, 10)
        }
        dualPortal.setProperty(portalSP.close, true);
        const dualPortalDimension = dualPortal.dimension;
        system.runTimeout(()=>{
          dualPortal.remove();
          // Remove tickingarea after entity removal
          if(typeof dualTickingArea == "string"){
            try {
              dualPortalDimension.runCommand(`tickingarea remove "${dualTickingArea}"`)
            } catch {}
          }
        }, tickDelay);
        if(itemObject !== undefined){
          portalIds = portalIds.filter((id) => id !== dualPortal.id);
        }
      }
    }
  }

  const tickingArea = portalEntity.getDynamicProperty(portalDP.tickingArea)
  const block = portalEntity.dimension.getBlock(portalEntity.location);
  const isInWater =
    block.typeId === "minecraft:water" ||
    block.typeId === "minecraft:flowing_water";
  const isInLava =
    block.typeId === "minecraft:lava" ||
    block.typeId === "minecraft:flowing_lava";
  if (isInWater || isInLava) {
    let dimension = portalEntity.dimension;
    let location = portalEntity.location;
    system.runTimeout(()=>{
      dimension.runCommand(
        `setblock ${location.x} ${location.y} ${location.z} air`
      );
    }, 10)
  }

  portalEntity.setProperty(portalSP.close, true);
  const portalDimension = portalEntity.dimension;
  system.runTimeout(()=>{
    portalEntity.remove();
    // Remove tickingarea after entity removal
    if(typeof tickingArea == "string"){
      try {
        portalDimension.runCommand(`tickingarea remove "${tickingArea}"`)
      } catch {}
    }
  }, tickDelay);

  if(itemObject !== undefined)
    savePortalList(
      portalGunItem,
      portalIds,
      player,
      inventory,
      itemObject.slotIndex
    );
}

export function removeAllPortals(player, portalGunItem, slotIndex = player.selectedSlotIndex) {
  const inventory = player.getComponent("inventory");
  const portalListJson = portalGunItem.getDynamicProperty(
    portalGunDP.portalList
  );
  let portalIds = portalListJson ? JSON.parse(portalListJson) : [];
  let animation_length = 0.46;
  const tickDelay = animation_length * 20;

  if (portalIds.length > 0) {
    portalIds.forEach((portal) => {
      const portalEntity = world.getEntity(portal);
      const block = portalEntity.dimension.getBlock(portalEntity.location);
      const isInWater =
        block.typeId === "minecraft:water" ||
        block.typeId === "minecraft:flowing_water";
      const isInLava =
        block.typeId === "minecraft:lava" ||
        block.typeId === "minecraft:flowing_lava";
      if (isInWater || isInLava) {
        let dimension = portalEntity.dimension;
        let location = portalEntity.location;
        system.runTimeout(()=>{
          dimension.runCommand(
            `setblock ${location.x} ${location.y} ${location.z} air`
          );
        }, 10)
      }
      const oldTickingArea = portalEntity.getDynamicProperty(
        portalDP.tickingArea
      );
      portalEntity.setProperty(portalSP.close, true);
      system.runTimeout(()=>{
        portalEntity.remove();
        // Remove tickingarea after entity removal
        if (typeof oldTickingArea === "string") {
          try {
            portalEntity.dimension.runCommand(
              `tickingarea remove "${oldTickingArea}"`
            );
          } catch {}
        }
      }, tickDelay);
    });
    portalIds = [];
    savePortalList(portalGunItem, portalIds, player, inventory, slotIndex);
  }
}

export function savePortalList(
  portalGunItem,
  portalIds,
  player,
  inventory,
  slotIndex = player.selectedSlotIndex
) {
  portalGunItem.setDynamicProperty(
    portalGunDP.portalList,
    JSON.stringify(portalIds)
  );
  inventory.container.setItem(slotIndex, portalGunItem);
}

export function findPortalGunInInventory(player, portalGunId) {
  const inventory = player.getComponent("inventory");
  if (!inventory || !inventory.container) {
    return undefined;
  }
  const container = inventory.container;
  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);

    if (item && ID.portalGuns.includes(item.typeId)) {
      let gunId = item.getDynamicProperty(portalGunDP.id);
      if (gunId == portalGunId) return { item, slotIndex: i };
    }
  }
  return undefined;
}

export function findItemInInventory(player, itemId) {
  const inventory = player.getComponent("inventory");
  if (!inventory || !inventory.container) {
    return undefined;
  }
  const container = inventory.container;
  for (let i = 0; i < container.size; i++) {
    const itemStack = container.getItem(i);
    
    if (itemStack && itemStack.typeId === itemId) {
      return { itemStack, slotIndex: i };
    }
  }
  return undefined;
}

export function getRotationToPlayer(player, entityLocation) {
  const playerLocation = player.location;
  const dx = playerLocation.x - entityLocation.x;
  const dz = playerLocation.z - entityLocation.z;

  const angle = Math.atan2(dz, dx) * (180 / Math.PI);

  const normalizedAngle = (angle + 360) % 360;

  if (normalizedAngle >= 315 || normalizedAngle < 45) {
    return 3;
  } else if (normalizedAngle >= 45 && normalizedAngle < 135) {
    return 0;
  } else if (normalizedAngle >= 135 && normalizedAngle < 225) {
    return 1;
  } else {
    return 2;
  }
}

export function handlePortalGunHistory(portalGunItem, location){
  const max = 30;
  const historyJson = portalGunItem.getDynamicProperty(portalGunDP.historyLocations);
  let history = historyJson? JSON.parse(historyJson): [];

  if(history.length >= max){
    history.pop();
  }

  history.unshift(location);
  portalGunItem.setDynamicProperty(portalGunDP.historyLocations, JSON.stringify(history));
  return portalGunItem;
}

export function findNearbyAir(dimension, center, radius = 10) {
  const volume = new BlockVolume(
    {
      x: center.x - radius,
      y:  center.y - radius,
      z: center.z - radius,
    },
    {
      x: center.x + radius,
      y: center.y + radius,
      z: center.z + radius,
    }
  );

  const locations = [];
  try{
    const airBlocks = dimension.getBlocks(volume, { includeTypes: ["minecraft:air", "minecraft:water"] });
    for (const loc of airBlocks.getBlockLocationIterator()) {
      locations.push({ x: loc.x, y: loc.y, z: loc.z });
    }
  } catch (e){
    console.error(e)
  }


  return locations;
}