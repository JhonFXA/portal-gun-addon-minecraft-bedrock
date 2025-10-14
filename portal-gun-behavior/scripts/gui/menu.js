import { ItemStack } from "@minecraft/server";
import {ActionFormData, ModalFormData, MessageFormData} from "@minecraft/server-ui";
import {changePortalGunMode, removeAllPortals} from '../utils/my_API';
import { portalGunDP, ID } from "../utils/ids&variables";

/**
 * Opens the main Portal Gun menu for the player.
 *
 * @param {Player} player - The player interacting with the Portal Gun.
 *
 * Displays the main options such as:
 * Saved Locations, Set Coordinates, Select Mode, and Settings.
 */
export function openPortalGunMenu(player) {
    const inventory = player.getComponent("inventory");
    const portalGunItem = inventory.container.getItem(player.selectedSlotIndex)
    const currentMode = portalGunItem.getDynamicProperty(portalGunDP.mode);
    const charge = portalGunItem.getDynamicProperty(portalGunDP.charge)??0;

    // Visual charge indicator (0–5 bars)
    const totalBars = 5;
    const filledBars = Math.ceil(charge / 20); // 0-5
    let chargeBars = "";
    for (let i = 0; i < totalBars; i++) {
        chargeBars += i < filledBars ? "§a|§r" : "§0|§r";
    }

    const customUi = new ActionFormData()
    .title("Portal Gun Options")
    .body(`Mode: §a${currentMode}§r - Charge: ${chargeBars}`)
    .button("Saved Locations", "textures/ui/saved_locations_ui")
    .button("Set Coordinates", "textures/ui/set_coordinates_ui")
    .button("Select Mode", "textures/ui/select_mode_ui")
    .button("Settings", "textures/ui/settings_ui")
    .button("", "textures/ui/close_menu");

    player.dimension.playSound("ram_portalgun:open_menu", player.location);

    customUi.show(player).then(response => {
       switch (response.selection) {
            case 0: openSavedLocationsForm(player, inventory, portalGunItem); break;
            case 1: openSetCoordinatesForm(player, inventory, portalGunItem); break;
            case 2: openSelectModeForm(player, inventory, portalGunItem); break;
            case 3: openSettingsForm(player, inventory, portalGunItem); break;
            default: player.dimension.playSound("ram_portalgun:button_click", player.location);
        }
    })
}

/**
 * Displays the list of saved teleport locations stored in the Portal Gun.
 *
 * @param {Player} player - The player interacting with the menu.
 * @param {EntityInventoryComponent} inventory - The player's inventory component.
 * @param {ItemStack} portalGunItem - The current Portal Gun item.
 *
 * Allows the player to save, delete, or select custom teleport locations.
 */
function openSavedLocationsForm(player, inventory, portalGunItem) {
    player.dimension.playSound("ram_portalgun:button_click", player.location);
    const form = new ActionFormData()
    .title("Saved Locations")
    .button("Save Current Location", "textures/ui/save_ui")
    .button("Delete Location", "textures/ui/delete_location_ui")
    .divider()
    
    // Retrieve saved locations from the Portal Gun's dynamic property
    const locationsJson = portalGunItem.getDynamicProperty(portalGunDP.savedLocations);
    const savedLocations = locationsJson ? JSON.parse(locationsJson) : [];

    if(savedLocations.length > 0){
        form.label(`Locations (${savedLocations.length}):`);
        savedLocations.forEach(location => {
            const { dimensionId, name, x, y, z } = location;
            const { dimName, color } = getDimensionLabel(dimensionId);
            form.button(`§0${name}§r\nX: ${x}, Y: ${y}, Z: ${z}\nDimension: ${color}${dimName}§r`);
        });
    } else {
        form.label("No Locations Saved.")
    }
    form.divider().button("Back to Menu", "textures/ui/back_button");

    form.show(player).then(response => {
        if (response.selection === 0) {
            openSaveCurrentLocationForm(player, inventory, portalGunItem, savedLocations);
        } else if (response.selection === 1) {
            openDeleteLocationForm(player, inventory, portalGunItem, savedLocations);
        } else if (response.selection === savedLocations.length + 2){
            openPortalGunMenu(player);
        } else if (response.selection !== undefined){
            const selectedLocation = savedLocations[response.selection - 2];
            portalGunItem.setDynamicProperty(portalGunDP.customLocation, JSON.stringify(selectedLocation));
            portalGunItem.setDynamicProperty(portalGunDP.mode, "CUSTOM")
            inventory.container.setItem(player.selectedSlotIndex, portalGunItem);
            player.onScreenDisplay.setActionBar(
                `§aSet to location: ${selectedLocation.name} (§eX:${selectedLocation.x} Y:${selectedLocation.y} Z:${selectedLocation.z}§r)§r`
            );
            player.dimension.playSound("ram_portalgun:selection", player.location);
        }
    })
}

/**
 * Opens form to save the current player location.
 * @param {Player} player
 * @param {EntityInventoryComponent} inventory
 * @param {ItemStack} portalGunItem
 * @param {Array} savedLocations
 */
function openSaveCurrentLocationForm(player, inventory, portalGunItem, savedLocations){
    player.dimension.playSound("ram_portalgun:button_click", player.location);
    const form = new ModalFormData()
    .title("Save Current Location")
    .textField("Set The Location Name", "")
    form.show(player).then(response => {
        if (response.formValues[0]){
            const locationName = response.formValues[0];

            const newLocationData = {
                name: locationName,
                id: savedLocations.length,
                dimensionId: player.dimension.id,
                x: parseInt(player.location.x),
                y: parseInt(player.location.y),
                z: parseInt(player.location.z)
            };

            savedLocations.push(newLocationData);
            portalGunItem.setDynamicProperty(portalGunDP.savedLocations, JSON.stringify(savedLocations));
            inventory.container.setItem(player.selectedSlotIndex, portalGunItem);
            player.dimension.playSound("ram_portalgun:selection", player.location);
            openSavedLocationsForm(player, inventory, portalGunItem);

        }
    })
}

/**
 * Deletes a selected saved location.
 * Provides a cancel option if the player changes their mind.
 *
 * @param {Player} player
 * @param {EntityInventoryComponent} inventory
 * @param {ItemStack} portalGunItem
 * @param {Array} savedLocations
 */
function openDeleteLocationForm(player, inventory, portalGunItem, savedLocations){
    player.dimension.playSound("ram_portalgun:button_click", player.location);
    const form = new ActionFormData()
    .title("Delete Location")
    .body("Select a location to delete.");

    if(savedLocations.length === 0) {
        player.onScreenDisplay.setActionBar(
                `§cNo saved locations to delete.§r`
            );
        player.dimension.playSound("ram_portalgun:error_sound", player.location);
        return;
    }
    savedLocations.forEach((location) => {
        const { dimensionId, name, x, y, z } = location;
        const { dimName, color } = getDimensionLabel(dimensionId);
        form.button(`§0${name}§r\nX: ${x}, Y: ${y}, Z: ${z}\nDimension: ${color}${dimName}§r`);
    });
    form.divider()
    .button("Cancel");

    form.show(player).then(response => {
        if(response.selection == savedLocations.length){
            openSavedLocationsForm(player, inventory, portalGunItem);
        }
        else if (response.selection !== undefined){
            savedLocations.splice(response.selection, 1);
            portalGunItem.setDynamicProperty(portalGunDP.savedLocations, JSON.stringify(savedLocations));
            inventory.container.setItem(player.selectedSlotIndex, portalGunItem);
            player.dimension.playSound("ram_portalgun:selection", player.location);
            openDeleteLocationForm(player, inventory, portalGunItem, savedLocations);
        }
    })

}

/**
 * Opens the form to set custom coordinates for the Portal Gun.
 * Allows the player to input X, Y, Z, and select the dimension.
 *
 * @param {Player} player
 * @param {EntityInventoryComponent} inventory
 * @param {ItemStack} portalGunItem
 */
function openSetCoordinatesForm(player, inventory, portalGunItem) {
    player.dimension.playSound("ram_portalgun:button_click", player.location);
    let form = new ModalFormData()
    .title("Set Coordinates")
    .textField("X:", "")
    .textField("Y:", "")
    .textField("Z:", "")
    .divider()
    .dropdown("Dimension", ["Overworld", "Nether", "The End"],{ defaultValueIndex: 0 })

    form.show(player).then(response => {
        if( Number.isNaN(parseInt(response.formValues[0]))  || Number.isNaN(parseInt(response.formValues[1])) || Number.isNaN(parseInt(response.formValues[2]))){
            player.onScreenDisplay.setActionBar(
                `§cInvalid coordinates entered.§r`
            );
            player.dimension.playSound("ram_portalgun:error_sound", player.location);
        } else {
            const newLocationData = {
                name: "Unnamed Location",
                id: -Math.floor(Math.random() * 10000),
                x: parseInt(response.formValues[0]),
                y: parseInt(response.formValues[1]),
                z: parseInt(response.formValues[2]),
                dimensionId: response.formValues[4] == 0? "minecraft:overworld" : response.formValues[4] == 1? "minecraft:nether" : "minecraft:the_end"
            }

            portalGunItem.setDynamicProperty(portalGunDP.mode, "CUSTOM");
            portalGunItem.setDynamicProperty(portalGunDP.customLocation, JSON.stringify(newLocationData));
            inventory.container.setItem(player.selectedSlotIndex, portalGunItem);
            player.dimension.playSound("ram_portalgun:selection", player.location);
            player.onScreenDisplay.setActionBar(
                `§aSet to location: ${newLocationData.name} (§eX:${newLocationData.x} Y:${newLocationData.y} Z:${newLocationData.z}§r)§r`
            );
        }
    });
}

/**
 * Opens the Portal Gun mode selection menu.
 * Player can switch between FIFO, LIFO, Multi-Pair, or Root mode.
 *
 * @param {Player} player
 * @param {EntityInventoryComponent} inventory
 * @param {ItemStack} portalGunItem
 */
function openSelectModeForm(player, inventory, portalGunItem) {
    player.dimension.playSound("ram_portalgun:button_click", player.location);
    let form = new ActionFormData()
    .title("Select Mode")
    .button("FIFO Mode", "textures/ui/fifo_mode_button")
    .button("LIFO Mode", "textures/ui/lifo_mode_button")
    .button("Multi-Pair Mode", "textures/ui/multipair_mode_button")
    .button("Root Mode", "textures/ui/root_mode_button")
    .divider()
    .label("Modes explained:\n\n§eFIFO§r - First In First Out:\nAfter having 2 portals active, each new portal will replace the oldest one.\n\n§eLIFO§r - Last In First Out:\nAfter having 2 portals active, each new portal will replace the newest one.\n\n§eMulti-Pair§r:\nAllows you to have multiple pairs of portals active at the same time. You can enter any portal and come out from its pair.\n\n§eRoot§r:\nShoots a portal that acts as an anchor. You can shoot multiple portals, but when you enter one, you will always come out from the root portal. Entering the root portal will take you back to the last portal you entered.")
    .button("Back to Menu", "textures/ui/back_button");

    form.show(player).then(response => {
        switch (response.selection) {
            case 0: changePortalGunMode(player, inventory, portalGunItem, "FIFO"); 
                    player.onScreenDisplay.setActionBar(`§aSet Mode to FIFO.§r`); break;
            case 1: changePortalGunMode(player, inventory, portalGunItem, "LIFO"); 
                    player.onScreenDisplay.setActionBar(`§aSet Mode to LIFO.§r`); break;
            case 2: changePortalGunMode(player, inventory, portalGunItem, "Multi-Pair"); 
                    player.onScreenDisplay.setActionBar(`§aSet Mode to Multi-Pair.§r`); break;
            case 3: changePortalGunMode(player, inventory, portalGunItem, "Root"); 
                    player.onScreenDisplay.setActionBar(`§aSet Mode to Root.§r`); break;
            case 4: openPortalGunMenu(player); break;
        }
    })

}


/**
 * Opens the Portal Gun settings menu.
 * Provides access to behavior settings, history, dismounting, resetting, and debugging.
 *
 * @param {Player} player
 * @param {EntityInventoryComponent} inventory
 * @param {ItemStack} portalGunItem
 */
function openSettingsForm(player, inventory, portalGunItem) {
    player.dimension.playSound("ram_portalgun:button_click", player.location);
    let form = new ActionFormData()
    .title("Portal Gun Settings")
    .button("Behavior Settings", "textures/ui/toggle")
    .divider()
    .button("History", "textures/ui/history")
    .button("Dismount Portal Gun", "textures/ui/dismount")
    .button("Close All Portals", "textures/ui/close_all_portals")
    .button("Reset Portal Gun", "textures/ui/reset_portal_gun")
    .button("How to Use", "textures/ui/question_mark")
    .button("Debug Menu", "textures/ui/debug")
    .divider()
    .button("Back to Menu", "textures/ui/back_button")

    form.show(player).then(response => {
        switch (response.selection) {
            case 0: openBehaviorSettingsForm(player, portalGunItem, inventory); break;
            case 1: openHistoryForm(player, inventory, portalGunItem); break;
            case 2: dismountPortalGun(player, portalGunItem, inventory); break;
            case 3: removeAllPortals(player, portalGunItem); 
                player.dimension.playSound("ram_portalgun:selection", player.location); break;
            case 4: openResetForm(player, portalGunItem, inventory); break;
            case 5: openHowToUseForm(player, inventory, portalGunItem); break;
            case 6: openDebugMenu(player); break;
            case 7: openPortalGunMenu(player); break;
        }
    })
}


/**
 * Opens behavior settings form for the Portal Gun.
 * Adjusts auto-close, high pressure, safe placement, and portal scale.
 *
 * @param {Player} player
 * @param {ItemStack} portalGunItem
 * @param {EntityInventoryComponent} inventory
 */
function openBehaviorSettingsForm(player, portalGunItem, inventory){
    player.dimension.playSound("ram_portalgun:button_click", player.location);
    let autoClose = portalGunItem.getDynamicProperty(portalGunDP.autoClose);
    let scale = portalGunItem.getDynamicProperty(portalGunDP.scale);

    let form = new ModalFormData()
    .title("Behavior Settings")
    .toggle("Auto Close Portals", {
        defaultValue: autoClose? true: false,
        tooltip: "If enabled, portals will automatically\nclose after player enters them."
    })
    .toggle("High Pressure Mode", {
        defaultValue: portalGunItem.getDynamicProperty(portalGunDP.highPressure)? true: false,
        tooltip: "If enabled, portal gun will shoot\na high pressure projectile that\ncan reach further distances."
    })
    .toggle("Safe Placement", {
        defaultValue: portalGunItem.getDynamicProperty(portalGunDP.safePlacement)? true: false,
        tooltip: "If enabled, it ensures portals\nopen only in safe spots,\nnever buried underground or\nfloating too high."
    })
    .slider("Portal Scale", 1, 4, {
        defaultValue: scale == 0.5? 1 : scale == 1? 2 : scale == 1.5? 3 : scale == 2? 4 : 2,
        valueStep: 1
    })
    .divider()
    .submitButton("Save Changes");

    form.show(player).then(response => {
        if(response.cancelled) {
            return;
        } else {
            portalGunItem.setDynamicProperty(portalGunDP.autoClose, response.formValues[0]);
            portalGunItem.setDynamicProperty(portalGunDP.highPressure, response.formValues[1]);
            portalGunItem.setDynamicProperty(portalGunDP.safePlacement, response.formValues[2]);
            switch(response.formValues[3]){
                case 1:
                    portalGunItem.setDynamicProperty(portalGunDP.scale, 0.5);
                    break;
                case 2:
                    portalGunItem.setDynamicProperty(portalGunDP.scale, 1);
                    break;
                case 3:
                    portalGunItem.setDynamicProperty(portalGunDP.scale, 1.5);
                    break;
                case 4:
                    portalGunItem.setDynamicProperty(portalGunDP.scale, 2);
                    break;
                default:
                    portalGunItem.setDynamicProperty(portalGunDP.scale, 1);
                    break;
            }

            inventory.container.setItem(player.selectedSlotIndex, portalGunItem);
            player.onScreenDisplay.setActionBar(
                `§aSettings updated.§r`
            );
            player.dimension.playSound("ram_portalgun:selection", player.location);
        }

    })
}

/**
 * Opens the teleportation history menu.
 * Player can select previous locations (up to 30) to use them again.
 *
 * @param {Player} player
 * @param {EntityInventoryComponent} inventory
 * @param {ItemStack} portalGunItem
 */
function openHistoryForm(player, inventory, portalGunItem){
    player.dimension.playSound("ram_portalgun:button_click", player.location);
    const historyJson = portalGunItem.getDynamicProperty(portalGunDP.historyLocations);
    const history =  historyJson ? JSON.parse(historyJson) : [];

    let form = new ActionFormData()
    .title("History")
    .body("Here you can view your §eportal gun's teleportation history§r.\nSelect a location below to use it.\n\n§eLimit: 30 locations§r")
    .divider();

    if(history.length == 0){
        form.label("§eNo history to show.§r");
    } else history.forEach( location => {
        const { dimensionId, name, x, y, z } = location;
        const { dimName, color } = getDimensionLabel(dimensionId);
        form.button(`§0${name}§r\nX:${x}, Y:${y}, Z:${z}\nDimension: ${color}${dimName}§r`);
    });
    form.divider().button("Back to Settings", "textures/ui/back_button");

    form.show(player).then(response => {
        if (response.selection == history.length){
            openSettingsForm(player, inventory, portalGunItem);
        }
        else if (response.selection !== undefined){
            const selectedLocation = history[response.selection];
            portalGunItem.setDynamicProperty(portalGunDP.customLocation, JSON.stringify(selectedLocation));
            portalGunItem.setDynamicProperty(portalGunDP.mode, "CUSTOM")
            inventory.container.setItem(player.selectedSlotIndex, portalGunItem);
            player.onScreenDisplay.setActionBar(
                `§aSet to location: ${selectedLocation.name} (§eX:${selectedLocation.x} Y:${selectedLocation.y} Z:${selectedLocation.z}§r)§r`
            );
            player.dimension.playSound("ram_portalgun:selection", player.location);
        }
    });
}

/**
 * Opens a confirmation form to reset the Portal Gun.
 * Clears all dynamic properties and saved locations.
 *
 * @param {Player} player
 * @param {ItemStack} portalGunItem
 * @param {EntityInventoryComponent} inventory
 */
function openResetForm(player, portalGunItem, inventory){
    player.dimension.playSound("ram_portalgun:button_click", player.location);
    let form = new MessageFormData()
    .title("Reset Portal Gun")
    .body("Are you sure you want to reset your portal gun?\n\n§e[!]§r You will lose all your saved locations.")
    .button1("Yes")
    .button2("No")

    form.show(player).then(response =>{
        if(response.cancelled || response.selection === undefined){
            return;
        }
        if(response.selection == 0){
            removeAllPortals(player, portalGunItem);
            portalGunItem.clearDynamicProperties();
            inventory.container.setItem(player.selectedSlotIndex, portalGunItem);
            player.dimension.playSound("ram_portalgun:selection", player.location);
            player.onScreenDisplay.setActionBar(
                `§aPortal gun has been reset.§r`
            );
        } else if (response.selection == 1){
            openSettingsForm(player, inventory, portalGunItem);
        }
    })
}

/**
 * Opens the “How to Use” tutorial form.
 * Displays controls and basic usage instructions.
 *
 * @param {Player} player
 * @param {EntityInventoryComponent} inventory
 * @param {ItemStack} portalGunItem
 */
function openHowToUseForm(player, inventory, portalGunItem){
    player.dimension.playSound("ram_portalgun:button_click", player.location);
    let form = new ActionFormData()
    .title("How to Use")
    .header("Controls")
    .body("\n:mouse_right_button: - Interact\n\n:mouse_left_button: - Attack\n\n:tip_virtual_button_sneak: - Sneak (Shift)\n\n")
    .divider()
    .label("§eShoot Portals§r     :mouse_right_button:\n\n§eFast Change Location§r     :mouse_left_button:\n\n§eOpen Menu§r     :tip_virtual_button_sneak: + :mouse_right_button:\n\n§eRemove a Portal§r     :tip_virtual_button_sneak: + :mouse_left_button: while aiming at it\n\n")
    .button("Back to Menu", "textures/ui/back_button");
    form.show(player).then(response => {
        if(response.selection == 0){
            openSettingsForm(player, inventory, portalGunItem);
        } else {
            return;
        }
    });
}

/**
 * Opens the debug menu for the Portal Gun.
 * Displays all internal properties for troubleshooting.
 *
 * @param {Player} player
 */
function openDebugMenu(player){
    player.dimension.playSound("ram_portalgun:button_click", player.location);
    const inventory = player.getComponent("inventory");
    const portalGunItem = inventory.container.getItem(player.selectedSlotIndex);
    const portalListJson = portalGunItem.getDynamicProperty(portalGunDP.portalList);
    const portalList = portalListJson ? JSON.parse(portalListJson) : [];
    const id = portalGunItem.getDynamicProperty(portalGunDP.id);
    const lastUser = portalGunItem.getDynamicProperty(portalGunDP.lastUser);
    const mode = portalGunItem.getDynamicProperty(portalGunDP.mode);
    const autoClose = portalGunItem.getDynamicProperty(portalGunDP.autoClose)? true: false;
    const highPressure = portalGunItem.getDynamicProperty(portalGunDP.highPressure)? true: false;
    const safePlacement = portalGunItem.getDynamicProperty(portalGunDP.safePlacement)? true: false;
    const scale = portalGunItem.getDynamicProperty(portalGunDP.scale);
    const quantPortalsActive = portalList.length;
    const charge = portalGunItem.getDynamicProperty(portalGunDP.charge)??0;
    const savedLocationsJson = portalGunItem.getDynamicProperty(portalGunDP.savedLocations);
    const savedLocations = savedLocationsJson ? JSON.parse(savedLocationsJson) : [];
    const customLocationJson = portalGunItem.getDynamicProperty(portalGunDP.customLocation);
    const customLocation = customLocationJson ? JSON.parse(customLocationJson) : null;

    let form = new ActionFormData()
    .title("Debug Menu")
    .body(`
        ======== DEBUG =========\n
        ID: ${id}\n
        Last User: ${lastUser}\n
        Mode: ${mode}\n
        Charge: ${charge}%%\n
        Auto Close: ${autoClose}\n
        High Pressure: ${highPressure}\n
        Safe Placement: ${safePlacement}\n
        Scale: ${scale}x\n
        Quantity of Portals Active: ${quantPortalsActive}\n
        Quantity of Saved Locations: ${savedLocations.length}\n
        Set to Location: ${customLocation? `\n- Name: ${customLocation.name}\n- Dimension: ${customLocation.dimensionId}\n- X: ${customLocation.x}, Y: ${customLocation.y}, Z: ${customLocation.z}` : "None"}\n
        ========================\n
        `)
    .button("Back to Settings", "textures/ui/back_button");
    form.show(player).then(response => {
        if(response.selection == 0){
            openSettingsForm(player, inventory, portalGunItem);
        } else {
            return;
        }
    })
}

/**
 * Helper function: returns a user-friendly dimension name and color for UI.
 *
 * @param {string} dimensionId
 * @returns {{dimName: string, color: string}}
 */
function getDimensionLabel(dimensionId) {
    switch (dimensionId) {
        case "minecraft:overworld": return { dimName: "Overworld", color: "§q" };
        case "minecraft:nether": return { dimName: "Nether", color: "§4" };
        case "minecraft:the_end": return { dimName: "The End", color: "§u" };
        default: return { dimName: "Unknown", color: "§f" };
    }
}

/**
 * Dismounts the Portal Gun back to its base form and returns tubes for remaining charge.
 *
 * @param {Player} player
 * @param {ItemStack} portalGunItem
 * @param {EntityInventoryComponent} inventory
 */
function dismountPortalGun(player, portalGunItem, inventory) {
    const portalGunProperties = portalGunItem.getDynamicPropertyIds();
    const portalGunBase = new ItemStack("ram_portalgun:portal_gun_base", 1);

    portalGunProperties.forEach(id => {
        const value = portalGunItem.getDynamicProperty(id);
        portalGunBase.setDynamicProperty(id, value);
    });

    inventory.container.setItem(player.selectedSlotIndex, portalGunBase);

    const charge = portalGunItem.getDynamicProperty(portalGunDP.charge);
    if (charge > 0) {
        const chargedTube = new ItemStack("ram_portalgun:charged_tube", 1);
        chargedTube.setDynamicProperty(portalGunDP.charge, charge);
        chargedTube.setLore([`§eCharge: ${charge}%§r`]);
        inventory.container.addItem(chargedTube);
    } else {
        inventory.container.addItem(new ItemStack("ram_portalgun:empty_tube", 1));
    }

    player.dimension.playSound("ram_portalgun:portal_gun_unplug", player.location);
}