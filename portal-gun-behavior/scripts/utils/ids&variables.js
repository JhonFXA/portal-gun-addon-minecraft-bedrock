export var portalSP;
export var portalDP;
export var playerDP;
export var portalGunDP;
export var ID = {
  portalGuns : ["ram_portalgun:portal_gun", "ram_portalgun:portal_gun_base", "ram_portalgun:portal_gun_discharged"],
  fluidProjectile : "ram_portalgun:fluid_projectile",
  fluidProjectileHighPressure : "ram_portalgun:fluid_projectile_high_pressure",
  portal: "ram_portalgun:green_portal"
};

export const PORTAL_MODES = {
    FIFO: "FIFO",
    LIFO: "LIFO",
    MULTI_PAIR: "Multi-Pair",
    ROOT: "Root",
    CUSTOM: "CUSTOM"
};

(function (portalSP) {
  portalSP["isLinked"] = "ram_portalgun:is_linked";
  portalSP["rotation"] = "ram_portalgun:rotation";
  portalSP["orientation"] = "ram_portalgun:orientation";
  portalSP["close"] = "ram_portalgun:close"
  portalSP["scale"] = "ram_portalgun:portal_scale"
})(portalSP || (portalSP = {}));

(function (portalDP){
  portalDP["DualityPortalId"] = "ram_portalgun:dualityPortalId";
  portalDP["lastPortalUsed"] = "ram_portalgun:lastPortalUsed";
  portalDP["locationId"] = "ram_portalgun:location_id";
  portalDP["ownerPortalGun"] = "ram_portalgun:owner_portal_gun";
  portalDP["tickingArea"] = "ram_portalgun:ticking_area_name";
})(portalDP || (portalDP = {}));

(function (playerDP){
  playerDP["portalGunId"] = "ram_portalgun:portal_gun_id";
})(playerDP || (playerDP = {}));

(function (portalGunDP){
  portalGunDP["id"] = "ram_portalgun:portal_gun_id";
  portalGunDP["lastUser"] = "ram_portalgun:last_user";
  portalGunDP["portalList"] = "ram_portalgun:portal_list";
  portalGunDP["mode"] = "ram_portalgun:mode";
  portalGunDP["customLocation"] = "ram_portalgun:custom_location";
  portalGunDP["customLocationIndex"] = "ram_portalgun:custom_location_index";
  portalGunDP["savedLocations"] = "ram_portalgun:saved_locations";
  portalGunDP["historyLocations"] = "ram_portalgun:history_locations";
  portalGunDP["autoClose"] = "ram_portalgun:auto_close";
  portalGunDP["highPressure"] = "ram_portalgun:high_pressure";
  portalGunDP["safePlacement"] = "ram_portalgun:safe_placement";
  portalGunDP["charge"] = "ram_portalgun:charge";
  portalGunDP["scale"] = "ram_portalgun:portal_scale"

})(portalGunDP || (portalGunDP = {}));