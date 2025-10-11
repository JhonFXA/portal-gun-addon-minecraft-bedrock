import {
  Direction,
  system,
  ItemStack,
  EquipmentSlot,
  world
} from "@minecraft/server";
import { openPortalGunMenu } from "../gui/menu";
import { 
  findPortalGunInInventory, 
  linkPortals,
  validatePortalList,
  removePortal,
  removeAllPortals, 
  savePortalList, 
  spawnPortal,
  getRotationToPlayer,
  handlePortalGunHistory,
  findNearbyAir,
  findItemInInventory
} from "../utils/my_API";

import {
  ID,
  playerDP,
  portalGunDP,
  portalDP,
  PORTAL_MODES
} from "../utils/ids&variables";


function sleep(ticks) {
  return new Promise(resolve => system.runTimeout(resolve, ticks));
}

async function waitForChunkLoad(dimension, location, timeoutTicks = 100) {
  for (let i = 0; i < timeoutTicks; i++) {
    try {
      if (dimension.getBlock(location)) {
      return true;
      }
    } catch (e) {
      // Ignore errors, likely chunk not loaded yet
    }
    await sleep(1);
  }
  console.warn(`[PortalGun] Timeout while waiting for chunk to load at X: ${location.x}, Y: ${location.y}, Z: ${location.z}`);
  return false;
}

function initializePortalGun(portalGunItem) {
    if(portalGunItem.typeId == "ram_portalgun:portal_gun"){
      portalGunItem.setDynamicProperty(portalGunDP.charge, 100);
    } else {
      portalGunItem.setDynamicProperty(portalGunDP.charge, 0);
    }
    const portalGunId = Math.floor(Math.random() * 10000);
    portalGunItem.setDynamicProperty(portalGunDP.mode, PORTAL_MODES.FIFO);
    portalGunItem.setDynamicProperty(portalGunDP.id, portalGunId);
    return portalGunId;
}


function fireProjectile(player) {
  try {
    const headLocation = player.getHeadLocation();
    const viewDirection = player.getViewDirection();
    const inventory = player.getComponent("inventory").container;
    const portalGunItem = inventory.getItem(player.selectedSlotIndex);
    const spawnPosition = {
      x: headLocation.x,
      y: headLocation.y - 0.1,
      z: headLocation.z,
    };

    const projectileType = portalGunItem.getDynamicProperty(portalGunDP.highPressure) 
            ? ID.fluidProjectileHighPressure 
            : ID.fluidProjectile;

    const projectile = player.dimension.spawnEntity(projectileType, spawnPosition);
    const projectileComponent = projectile.getComponent("minecraft:projectile");

    if (projectileComponent) {
      projectileComponent.owner = player;
      projectileComponent.shoot(viewDirection);
    }

    player.dimension.playSound("ram_portalgun:fire_portal", player.location);
  } catch (error) {
    player.sendMessage(`§c[Portal Gun] Failed to fire projectile: \n§e[!] ${error}§r`);
    player.dimension.playSound("ram_portalgun:error_sound", player.location);
  }
}

function usePortalGun(player) {
  const inventory = player.getComponent("inventory");
  if (!inventory || !inventory.container) {
    return;
  }
  const portalGunItem = inventory.container.getItem(player.selectedSlotIndex);
  let portalGunId = portalGunItem.getDynamicProperty(portalGunDP.id);

  if (portalGunId === undefined) {
      portalGunId = initializePortalGun(portalGunItem);
      inventory.container.setItem(player.selectedSlotIndex, portalGunItem);
  }
  

  validatePortalList(portalGunItem, inventory, player.selectedSlotIndex);
  if(player.isSneaking){
    openPortalGunMenu(player);
  } else {
    const charge = portalGunItem.getDynamicProperty(portalGunDP.charge);
    if(charge > 0){
      portalGunItem.setDynamicProperty(portalGunDP.charge, charge - 1);
      let itemToUse = portalGunItem;
      if(charge - 1 == 0){
        const dischargedPortalGun = new ItemStack("ram_portalgun:portal_gun_discharged", 1);
        for (const id of portalGunItem.getDynamicPropertyIds()) {
          dischargedPortalGun.setDynamicProperty(id, portalGunItem.getDynamicProperty(id));
        }
        itemToUse = dischargedPortalGun;
        player.dimension.playSound("ram_portalgun:power_off_portal_gun", player.location);
      }
      player.setDynamicProperty(playerDP.portalGunId, portalGunId)
      itemToUse.setDynamicProperty(portalGunDP.lastUser, player.name);
      inventory.container.setItem(player.selectedSlotIndex, itemToUse);
      fireProjectile(player);
    } else {
      player.dimension.playSound("ram_portalgun:empty_portal_gun", player.location);
    }
  }
}

function getPortalPlacement(player, target) {
  if (!target) return;

  let rotation = 0, orientation = 0, location;

  if ("block" in target) {
    const block = target.block;
    if (!block?.isValid) {
      player.onScreenDisplay.setActionBar("§e[!] Block is not valid!");
      return;
    }
    const face = target.face;
    const ry = (player.getRotation().y + 180) % 360;

    switch (face) {
      case Direction.Up:
        location = block.above(1).center();
        location.y -= 0.5;
        orientation = 2;
        rotation = ry < 45 || ry >= 315 ? 0 : ry < 135 ? 1 : ry < 225 ? 2 : 3;
        break;
      case Direction.Down:
        location = block.below(1).center();
        location.y -= 0.5;
        orientation = 1;
        rotation = ry < 45 || ry >= 315 ? 0 : ry < 135 ? 1 : ry < 225 ? 2 : 3;
        break;
      case Direction.North:
        location = block.north(1).center();
        location.y -= 0.5;
        orientation = 0;
        rotation = 2;
        break;
      case Direction.West:
        location = block.west(1).center();
        location.y -= 0.5;
        orientation = 0;
        rotation = 1;
        break;
      case Direction.South:
        location = block.south(1).center();
        location.y -= 0.5;
        orientation = 0;
        rotation = 0;
        break;
      case Direction.East:
        location = block.east(1).center();
        location.y -= 0.5;
        orientation = 0;
        rotation = 3;
        break;
    }
  } else if ("entity" in target) {
    const entity = target.entity;
    if (!entity?.isValid) {
      player.onScreenDisplay.setActionBar("§e[!] Entity is not valid!");
      return;
    }
    location = entity.location;
    rotation = getRotationToPlayer(player, location);
    orientation = 0;
  }

  return { location, rotation, orientation };
}

function handleCustomMode(
  player,
  portalGunItem,
  itemObject,
  inventory,
  newPortal,
  portalIds,
  orientation,
  rotation,
  scale,
  portalGunId
) {
  const customLocationJson = portalGunItem.getDynamicProperty(portalGunDP.customLocation);
  const customLocation = JSON.parse(customLocationJson);
  const fixedCustomLocation = JSON.parse(JSON.stringify(customLocation));
  const customLocationId = customLocation.id;
  const safePlacement = portalGunItem.getDynamicProperty(portalGunDP.safePlacement) === true;

  // Check if portal already exists
  if (portalIds.length > 1) {
    const rootPortal = world.getEntity(portalIds[0]);
    if (customLocationId !== rootPortal?.getDynamicProperty(portalDP.locationId)) {
      removeAllPortals(player, portalGunItem, itemObject.slotIndex);
      portalIds = [newPortal.id];
    } else {
      linkPortals(portalIds[0], newPortal.id);
      portalGunItem.setDynamicProperty(portalGunDP.portalList, JSON.stringify(portalIds));
      inventory.container.setItem(itemObject.slotIndex, portalGunItem);
      return;
    }
  }

  const targetDimension = world.getDimension(customLocation.dimensionId);
  const randomId = Math.floor(Math.random() * 10000);
  const tickingAreaName = `portal_${player.name}_${randomId}`;
  
  try {
    targetDimension.runCommand(
      `tickingarea add circle ${fixedCustomLocation.x} ${fixedCustomLocation.y} ${fixedCustomLocation.z} 1 "${tickingAreaName}"`
    );
  } catch (e) {
    console.error(`Failed to create ticking area: ${e}`);
    player.sendMessage("§c[!] An error occurred while trying to load the portal area.§r");
    return;
  }

  // Wait for chunk to load and then spawn the portal
  system.run(async () => {
    const chunkLoaded = await waitForChunkLoad(targetDimension, customLocation);
    
    if (!chunkLoaded) {
      player.sendMessage(
          "§c[!] Failed to load the remote portal area. The location may be invalid or the server is overloaded.§r"
      );
      removePortal(player, newPortal, false);
      targetDimension.runCommand(`tickingarea remove "${tickingAreaName}"`);
      return;
    }

    if(safePlacement){
      let foundValidSpot = false;

      const block = targetDimension.getBlock(customLocation);
      
      if(!block){
        world.sendMessage("oh man")
        return;
      }

      if(block && block.isAir){
        let safeY = fixedCustomLocation.y;
        while (safeY > targetDimension.heightRange.min) {
          const groundBlock = targetDimension.getBlock({ x: fixedCustomLocation.x, y: safeY - 1, z: fixedCustomLocation.z });

          // Found solid ground?
          if (groundBlock && !groundBlock.isAir) {
            if(fixedCustomLocation.y - safeY > 8){
              fixedCustomLocation.y = safeY;
            }
            foundValidSpot = true;
            break;
          }
          safeY--;
        }
      } else {
        // First attempt: search for nearby air within radius 15
        let candidates = []
        
        try {
          candidates = findNearbyAir(targetDimension, customLocation, 10);
        } catch (e){
          player.sendMessage("§c[!] Error finding a safe location for the portal.§r");
          removePortal(player, newPortal, false);
          targetDimension.runCommand(`tickingarea remove "${tickingAreaName}"`);
          return;
        }
    
        if (candidates.length > 0) {
        // Sort candidates by distance from original location
        candidates.sort((a, b) => {
          const da =
            (a.x - fixedCustomLocation.x) ** 2 +
            (a.y - fixedCustomLocation.y) ** 2 +
            (a.z - fixedCustomLocation.z) ** 2;
          const db =
            (b.x - fixedCustomLocation.x) ** 2 +
            (b.y - fixedCustomLocation.y) ** 2 +
            (b.z - fixedCustomLocation.z) ** 2;
          return da - db;
        });
    
        const best = candidates[0];
        fixedCustomLocation.x = best.x + 0.5;
        fixedCustomLocation.y = best.y;
        fixedCustomLocation.z = best.z + 0.5;
        foundValidSpot = true;
        } else {
          // Fallback: vertical scan upwards until air is found
          const maxHeight = targetDimension.heightRange.max;
          while (fixedCustomLocation.y < maxHeight) {
            const block = targetDimension.getBlock(fixedCustomLocation);
            if (block && (block.isAir || block.typeId === "minecraft:water")) {
              foundValidSpot = true;
              break;
            }
            fixedCustomLocation.y++;
          }
        }
      }

      if (!foundValidSpot) {
      player.sendMessage("§c[!] The target location is not safe.§r");
      removePortal(player, newPortal, false);
      targetDimension.runCommand(`tickingarea remove "${tickingAreaName}"`);
      return;
      }
    }
    let customPortalOrientation = 0;
    if (orientation === 1) {
      customPortalOrientation = 2;
    } else if (orientation === 2) {
      customPortalOrientation = 1;
      fixedCustomLocation.y += 2;
    }
    let customPortal = spawnPortal(
      targetDimension,
      fixedCustomLocation,
      rotation,
      customPortalOrientation,
      scale,
      portalGunId
    );
    if (!customPortal) {
      player.sendMessage("§c[!] The portal area did not load in time. Please try again.§r");
      removePortal(player, newPortal, false);
      targetDimension.runCommand(`tickingarea remove "${tickingAreaName}"`);
      return;
    }
    customPortal.setDynamicProperty(portalDP.locationId, customLocationId);
    customPortal.setDynamicProperty(portalDP.tickingArea, tickingAreaName);

    linkPortals(customPortal.id, newPortal.id);
    portalIds = [customPortal.id, newPortal.id];

    portalGunItem.setDynamicProperty(portalGunDP.portalList, JSON.stringify(portalIds));
    portalGunItem = handlePortalGunHistory(portalGunItem, customLocation);
    inventory.container.setItem(itemObject.slotIndex, portalGunItem);

  });
}

function summonPortal(player, target) {
  const placement = getPortalPlacement(player, target);
  if (!placement) {
    player.sendMessage("§c[!] Invalid target for portal placement.§r");
    return;
  }
  const { location, rotation, orientation } = placement;

  system.run(() => {
    const inventory = player.getComponent("inventory");
    if (!inventory || !inventory.container) {
      return;
    }

    const ownerId = player.getDynamicProperty(playerDP.portalGunId);
    const itemObject = findPortalGunInInventory(player, ownerId);
    const portalGunItem = itemObject?.item;
    if (!portalGunItem) {
      player.sendMessage("§c[!] Portal Gun not found in inventory.");
      return;
    }
    const portalGunMode = portalGunItem.getDynamicProperty(portalGunDP.mode);
    const portalGunId = portalGunItem.getDynamicProperty(portalGunDP.id);
    const scale = portalGunItem.getDynamicProperty(portalGunDP.scale) ?? 1;

    const portalListJson = portalGunItem.getDynamicProperty(portalGunDP.portalList);
    let portalIds = portalListJson ? JSON.parse(portalListJson) : [];

    let newPortal = spawnPortal(player.dimension, location, rotation, orientation, scale, portalGunId);

    portalIds.push(newPortal.id);

    switch (portalGunMode) {
      case PORTAL_MODES.FIFO:
        if (portalIds.length == 2) {
          linkPortals(portalIds[0], portalIds[1]);
        }
        if (portalIds.length > 2) {
          const oldestPortalId = portalIds.shift();
          const oldestPortal = world.getEntity(oldestPortalId);
          if (oldestPortal) {
            removePortal(player, oldestPortal, false);
          }
          linkPortals(portalIds[0], portalIds[1]);
        }
        savePortalList(portalGunItem, portalIds, player, inventory, itemObject.slotIndex);
        break;

      case PORTAL_MODES.LIFO:
        if (portalIds.length == 2) {
          linkPortals(portalIds[0], portalIds[1]);
        }
        if (portalIds.length > 2) {
          const newerPortalId = portalIds.splice(1, 1)[0];
          const newerPortal = world.getEntity(newerPortalId);
          if (newerPortal) {
            removePortal(player, newerPortal, false);
          }
          linkPortals(portalIds[0], portalIds[1]);
        }
        savePortalList(portalGunItem, portalIds, player, inventory, itemObject.slotIndex);
        break;

      case PORTAL_MODES.MULTI_PAIR:
        if (portalIds.length % 2 == 0) {
          linkPortals(portalIds[portalIds.length - 2], portalIds[portalIds.length - 1]);
        }
        savePortalList(portalGunItem, portalIds, player, inventory, itemObject.slotIndex);
        break;

      case PORTAL_MODES.ROOT:
        if (portalIds.length > 1) {
          linkPortals(portalIds[0], portalIds[portalIds.length - 1]);
        }
        savePortalList(portalGunItem, portalIds, player, inventory, itemObject.slotIndex);
        break;

      case PORTAL_MODES.CUSTOM:
        handleCustomMode(player, portalGunItem, itemObject, inventory, newPortal, portalIds, orientation, rotation, scale, portalGunId);
        break;

      default:
        break;
    }
  });
}



world.afterEvents.itemUse.subscribe((event) => {
  const { itemStack, source: player } = event;
  if (!ID.portalGuns.includes(itemStack.typeId)) return;

  if (itemStack.typeId === "ram_portalgun:portal_gun_base") {
    const equippable = player.getComponent("minecraft:equippable");
    const itemOffhand = equippable.getEquipment(EquipmentSlot.Offhand);

    const tubeTypes = {
      "ram_portalgun:charged_tube": "ram_portalgun:portal_gun",
      "ram_portalgun:empty_tube": "ram_portalgun:portal_gun_discharged"
    };

    const newGunType = tubeTypes[itemOffhand?.typeId];
    if (newGunType) {
      const inventory = player.getComponent("inventory").container;
      const portalGun = new ItemStack(newGunType, 1);

      for (const id of itemStack.getDynamicPropertyIds()) {
        portalGun.setDynamicProperty(id, itemStack.getDynamicProperty(id));
      }

      if(itemOffhand.typeId === "ram_portalgun:charged_tube"){
        const currentCharge = itemOffhand.getDynamicProperty(portalGunDP.charge) ?? 100;
        portalGun.setDynamicProperty(portalGunDP.charge, currentCharge);
      } else if (itemOffhand.typeId === "ram_portalgun:empty_tube"){
        portalGun.setDynamicProperty(portalGunDP.charge, 0);
      }
      
      if (itemOffhand.amount > 1) {
        itemOffhand.amount -= 1;
        equippable.setEquipment(EquipmentSlot.Offhand, itemOffhand);
      } else {
        equippable.setEquipment(EquipmentSlot.Offhand, undefined);
      }

      inventory.setItem(player.selectedSlotIndex, portalGun);
      player.dimension.playSound("ram_portalgun:portal_gun_plug", player.location);
      return;
    }
    return;
  }

  const cooldownComponent = itemStack.getComponent("cooldown");
  const cooldown = player.getItemCooldown("portal_gun_cooldown");
  const cooldownTicks = cooldownComponent.cooldownTicks

  if(cooldown < cooldownTicks - 1) return;
  usePortalGun(player);
});

world.afterEvents.entityHitEntity.subscribe((event) => {
  if (event.damagingEntity.typeId !== "minecraft:player") return;
  const player = event.damagingEntity;
  if(!player.isSneaking) return;
  const portalEntity = event.hitEntity;
  if (!portalEntity.matches({ families: ["ram_portalgun:portal"] })) return;

  const portalGunItem = player.getComponent("inventory").container.getItem(player.selectedSlotIndex);
  
  if (!portalGunItem) return;
  if (!ID.portalGuns.includes(portalGunItem.typeId)) return;

  const mode = portalGunItem.getDynamicProperty(portalGunDP.mode);
  const portalListJson = portalGunItem.getDynamicProperty(portalGunDP.portalList);
  let portalIds = portalListJson ? JSON.parse(portalListJson) : [];

  if((mode == PORTAL_MODES.ROOT || mode == PORTAL_MODES.CUSTOM) && portalIds.length > 2) {
    removePortal(player, portalEntity, false);
  } else {
    removePortal(player, portalEntity);
  }
});

world.afterEvents.projectileHitBlock.subscribe((event) => {
  if (event.projectile.typeId !== ID.fluidProjectile && event.projectile.typeId !== ID.fluidProjectileHighPressure) {
    return;
  }
  const player = event.source;
  summonPortal(player, event.getBlockHit());
});

world.afterEvents.projectileHitEntity.subscribe((event) => {
  if (event.projectile.typeId !== ID.fluidProjectile && event.projectile.typeId !== ID.fluidProjectileHighPressure) {
    return;
  }

  const hitEntity = event.getEntityHit()?.entity;
  if(hitEntity.typeId == ID.portal){
    return;
  }

  const player = event.source;
  summonPortal(player, event.getEntityHit());
});

world.afterEvents.entityHitBlock.subscribe((event) => {
  if (event.damagingEntity.typeId !== "minecraft:player") return;
  const player = event.damagingEntity;
  if (player.isSneaking) return;

  const inventory = player.getComponent("inventory");
  const item = inventory?.container.getItem(player.selectedSlotIndex);
  if (!item) return;
  if (!ID.portalGuns.includes(item.typeId)) return;

  let savedLocationsJson = item.getDynamicProperty(portalGunDP.savedLocations);
  let savedLocations = savedLocationsJson ? JSON.parse(savedLocationsJson) : [];
  if (savedLocations.length === 0) return;

  let mode = item.getDynamicProperty(portalGunDP.mode);
  let currentIndex = Number(item.getDynamicProperty(portalGunDP.customLocationIndex) ?? 0);

  if (mode !== PORTAL_MODES.CUSTOM) {
    item.setDynamicProperty(portalGunDP.mode, PORTAL_MODES.CUSTOM);
  } else {
    currentIndex = (currentIndex + 1) % savedLocations.length;
  }

  item.setDynamicProperty(portalGunDP.customLocation, JSON.stringify(savedLocations[currentIndex]));
  item.setDynamicProperty(portalGunDP.customLocationIndex, currentIndex);

  let dimension = savedLocations[currentIndex].dimensionId;
  switch (dimension) {
    case "minecraft:overworld":
      dimension = "Overworld";
      break;
    case "minecraft:nether":
      dimension = "Nether";
      break;
    case "minecraft:the_end":
      dimension = "The End";
      break;
  }

  inventory.container.setItem(player.selectedSlotIndex, item);
  player.dimension.playSound("ram_portalgun:selection", player.location);
  player.onScreenDisplay.setActionBar(
    `Location: §a${savedLocations[currentIndex].name}§r (${currentIndex + 1}/${savedLocations.length})\nDimension: §a${dimension}§r`
  );
});

world.beforeEvents.playerBreakBlock.subscribe((event) => {
    const inventory = event.player.getComponent("inventory");
    const selectedItem = inventory?.container.getItem(event.player.selectedSlotIndex);
    if (!selectedItem) return;
    if (!ID.portalGuns.includes(selectedItem.typeId)) return;
    event.cancel = true;
});
