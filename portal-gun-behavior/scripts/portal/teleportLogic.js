import {system, world} from "@minecraft/server";
import { portalDP, portalSP, portalGunDP, ID, PORTAL_MODES} from "../utils/ids&variables";
import { calculateEuclideanDistance, findItemInInventory, removePortal } from "../utils/my_API";

system.runInterval(() => {
    runCooldown();
    onTick();
}, 1);
system.runInterval(() => {
    tagHandling();
}, 5);

const TELEPORTED_TAG = "ram_portalgun:teleported";
const OBJECTIVE_ID = "ram_portalgun:cooldownTime";

function tagHandling() {
    const queryOptions = { tags: [TELEPORTED_TAG] };
    let entitiesWithTag = [];
    entitiesWithTag = entitiesWithTag.concat(world.getDimension("minecraft:overworld").getEntities(queryOptions));
    entitiesWithTag = entitiesWithTag.concat(world.getDimension("minecraft:nether").getEntities(queryOptions));
    entitiesWithTag = entitiesWithTag.concat(world.getDimension("minecraft:the_end").getEntities(queryOptions));

    entitiesWithTag.forEach(entity => {
        if (!isOnCooldown(entity)) {
            const lastPortalId = entity.getDynamicProperty(portalDP.lastPortalUsed);
            if (lastPortalId === undefined) {
                entity.removeTag(TELEPORTED_TAG);
            }
            else {
                const lastPortal = world.getEntity(lastPortalId);
                if (lastPortal === undefined) {
                    entity.removeTag(TELEPORTED_TAG);
                }
                else {
                    if (entity.dimension.id !== lastPortal.dimension.id) {
                        entity.removeTag(TELEPORTED_TAG);
                    }
                    else {
                        const distance = calculateEuclideanDistance(entity.location, lastPortal.location);
                        const portalScale = lastPortal.getProperty(portalSP.scale);
                        const maxDistance = portalScale > 1 ? 3 : 2;
                        if (distance >= maxDistance) {
                            entity.removeTag(TELEPORTED_TAG);
                        }
                    }
                }
            }
        }
    });
}

function runCooldown() {
    let scoreboard = world.scoreboard.getObjective(OBJECTIVE_ID);
    if (scoreboard === undefined) {
        scoreboard = world.scoreboard.addObjective(OBJECTIVE_ID, OBJECTIVE_ID);
    }
    scoreboard.getParticipants().forEach(participant => {
        let score = scoreboard.getScore(participant);
        score--;
        if (score < 0) {
            scoreboard.removeParticipant(participant);
        }
        else {
            scoreboard.setScore(participant, score);
        }
    });
}

function onTick() {
    let entities = [];
    entities = entities.concat(world.getDimension("minecraft:overworld").getEntities({ families: ["ram_portalgun:portal"] }));
    entities = entities.concat(world.getDimension("minecraft:nether").getEntities({ families: ["ram_portalgun:portal"] }));
    entities = entities.concat(world.getDimension("minecraft:the_end").getEntities({ families: ["ram_portalgun:portal"] }));

    entities.forEach(portal => {
        const block = portal.dimension.getBlock(portal.location);
        const initialLocation = portal.location;
        const isInWater = block.typeId === 'minecraft:water' || block.typeId === 'minecraft:flowing_water';
        const isInLava = block.typeId === 'minecraft:lava' || block.typeId === 'minecraft:flowing_lava';

        const dualityPortalId = portal.getDynamicProperty(portalDP.DualityPortalId);
        if (dualityPortalId === undefined) {
            return;
        }

        let dualPortal = world.getEntity(dualityPortalId);
        const isLinked = dualPortal !== undefined;
        portal.setProperty(portalSP.isLinked, isLinked);
        if (isLinked == false) {
            return;
        }
        if(isInWater){ 
            portal.teleport(initialLocation);
            dualPortal.dimension.runCommand(`setblock ${dualPortal.location.x} ${dualPortal.location.y} ${dualPortal.location.z} flowing_water`)
        } else if (isInLava){
            portal.teleport(initialLocation);
            dualPortal.dimension.runCommand(`setblock ${dualPortal.location.x} ${dualPortal.location.y} ${dualPortal.location.z} flowing_lava`)
        }

        const orientation = portal.getProperty(portalSP.orientation);
        const scale = portal.getProperty(portalSP.scale);
        let radius = 1;

        if(scale == 0.5) {
            radius = 0.8;
        }
        else if (scale == 1) {
            if(orientation == 0) radius = 1.2;
            else radius = 1;
        }
        else if(scale > 1){
            if(orientation == 0) radius = 2.2;
            else radius = 2;
        }
        const entities = findEntitiesNearPortal(portal.dimension, portal.location, radius);
        if (entities.length > 0) {
            portal.playAnimation("animation.ram_portalgun.portal.pass");
            dualPortal.playAnimation("animation.ram_portalgun.portal.pass");
            
            entities.forEach(entity => {
                if (entity.typeId !== "minecraft:player") {
                    activateCooldown(entity);
                    entity.setDynamicProperty(portalDP.lastPortalUsed, dualPortal.id);
                    entity.addTag(TELEPORTED_TAG);
                    //OBSERVACAO: ENTIDADES PODEM SUMIR QUANDO TELEPORTADAS PARA DIMENSOES DIFERENTES
                    teleportEntityToLocation(dualPortal, entity);
                } else {
                    playerUsePortal(portal, dualPortal, entity);
                }
            });
        }
    });
}

function playerUsePortal(portal, dualPortal, player) {
    const animation_length = 0.25;
    const tickDelay = animation_length * 20;
    const cooldown = 30 + tickDelay;
    activateCooldown(player, cooldown);
    player.setDynamicProperty(portalDP.lastPortalUsed, dualPortal.id);
    player.addTag(TELEPORTED_TAG);

    system.runTimeout(() => {
        teleportEntityToLocation(dualPortal, player);
        let portalGunId = portal.getDynamicProperty(portalDP.ownerPortalGun);
        let itemObject = findItemInInventory(player, ID.portalGuns[0], portalGunId);
        let portalGunItem = itemObject?.item;
        if(portalGunItem){
            const autoClose = portalGunItem.getDynamicProperty(portalGunDP.autoClose);
            if(autoClose){
                const portalListJson = portalGunItem.getDynamicProperty(portalGunDP.portalList);
                let portalIds = portalListJson ? JSON.parse(portalListJson) : [];
                
                system.runTimeout(()=>{
                    let hasGun = findItemInInventory(player, ID.portalGuns[0], portalGunId);
                    if(hasGun){
                        let currentMode = portalGunItem.getDynamicProperty(portalGunDP.mode)
                        if((currentMode == PORTAL_MODES.ANCHOR || currentMode == PORTAL_MODES.CUSTOM) && portalIds.length > 2){
                            if(portal.id == portalIds[0]){
                                removePortal(player, dualPortal, false);
                            } else {
                                removePortal(player, portal, false);
                            }
                        } else {
                            removePortal(player, portal, true);
                        }
                    }
                }, 30)
            }
        }
    }, tickDelay);
}

function isOnCooldown(entity) {
    let scoreboard = world.scoreboard.getObjective(OBJECTIVE_ID);
    if (scoreboard === undefined) {
        scoreboard = world.scoreboard.addObjective(OBJECTIVE_ID, OBJECTIVE_ID);
    }
    return scoreboard.hasParticipant(entity);
}
function activateCooldown(entity, ticks = 20) {
    let scoreboard = world.scoreboard.getObjective(OBJECTIVE_ID);
    if (scoreboard === undefined) {
        scoreboard = world.scoreboard.addObjective(OBJECTIVE_ID, OBJECTIVE_ID);
    }
    scoreboard.setScore(entity, ticks);
}

function findEntitiesNearPortal(dimension, location, radius) {
    const queryOptions = {
        location,
        maxDistance: radius,
        excludeFamilies: ["ram_portalgun:portal", "ram_portalgun:fluid_projectile"]
    };
    return dimension.getEntities(queryOptions).filter(entity => {
        const teleportationConditions = !isOnCooldown(entity) && !entity.hasTag(TELEPORTED_TAG);
        return teleportationConditions;
    });
}
function teleportEntityToLocation(dualPortal, entity) {
    let orientation = dualPortal.getProperty(portalSP.orientation);
    let rotation = dualPortal.getProperty(portalSP.rotation);
    let ry = entity.getRotation().y;
    if (orientation == 0) {
        switch (rotation) {
            case 0: {
                ry = 0;
                break;
            }
            case 1: {
                ry = 90;
                break;
            }
            case 2: {
                ry = 180;
                break;
            }
            case 3: {
                ry = -90;
                break;
            }
        }
    }
    let entityLocation = dualPortal.location;
    if (orientation == 1) {
        entityLocation.y--;
    }
    entity.teleport(entityLocation, {
        dimension: dualPortal.dimension,
        rotation: {
            x: entity.getRotation().x,
            y: ry
        }
    });
}