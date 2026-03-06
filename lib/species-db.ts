export const FISH_GUIDE: Record<string, { limit: string, minSize: string, idTip: string }> = {
  // --- LAKES & PONDS ---
  "Largemouth bass": { limit: "5/day", minSize: "none", idTip: "Dark green above, white below; large jaw extends beyond the eye." },
  "Smallmouth bass": { limit: "5/day", minSize: "none", idTip: "Bronze-brown body with vertical dark bands; jaw does not extend past eye." },
  "Rock bass": { limit: "5/day", minSize: "none", idTip: "Mottled green body, deep laterally compressed; red eyes and large mouth." },
  "Green sunfish": { limit: "5/day", minSize: "none", idTip: "Stocky green-blue body with yellow-edged fins; large mouth and a dark spot on the dorsal fin." },
  "Bluegill": { limit: "5/day", minSize: "none", idTip: "Round olive-green body with blue-orange lower belly; dark spot on the gill cover." },
  "Black crappie": { limit: "5/day", minSize: "none", idTip: "Deep compressed silvery body with irregular dark speckles." },
  "Tiger muskie": { limit: "1/day", minSize: "50\"", idTip: "Long, torpedo-shaped body with dark vertical bars; pattern like a tiger." },
  "Walleye": { limit: "5/day", minSize: "none", idTip: "Slender olive-golden body; dark blotch on first dorsal fin and sharp canine-like teeth." },
  "Yellow perch": { limit: "5/day", minSize: "none", idTip: "Golden body with dark vertical bars; white belly and no prominent canine teeth." },
  "Grass carp": { limit: "5/day", minSize: "none", idTip: "Long silver-olive body with very large scales (head scaleless)." },
  "Channel catfish": { limit: "5/day", minSize: "none", idTip: "Slender body, no scales, deeply forked tail and whisker-like barbels." },

  // --- RIVERS & CREEKS ---
  "Steelhead trout": { limit: "Varies by area", minSize: "none", idTip: "Bright silver body with faint spotting; often with hooked jaw in freshwater." },
  "Chinook salmon": { limit: "Varies", minSize: "24\"", idTip: "Black spots on back and both tail lobes, black mouth and gum line." },
  "Coho salmon": { limit: "Varies", minSize: "16\"", idTip: "Black spots on back and upper tail lobe only, white mouth and gums." },
  "Pink salmon": { limit: "Varies", minSize: "12\"", idTip: "Large black spots on back and both tail lobes; small mouth." },
  "Chum salmon": { limit: "Varies", minSize: "12\"", idTip: "Silver body; no prominent spots on back or tail; white mouth and gums." },
  "Sockeye salmon": { limit: "Varies", minSize: "12\"", idTip: "Silver body with bluish back; no distinct spots on back or tail." },
  "Mountain whitefish": { limit: "15/day", minSize: "none", idTip: "Small, down-turned mouth; large scales; light brown to silver body." },
  "Bull trout": { limit: "Catch & Release Only", minSize: "N/A", idTip: "Olive-green with pale yellow/pink spots; NO black spots on the dorsal fin." },
  "Dolly varden": { limit: "Varies", minSize: "none", idTip: "Very similar to Bull Trout; usually found in coastal streams/creeks." },
  "Northern pikeminnow": { limit: "No Limit", minSize: "none", idTip: "Large mouth with no teeth; yellowish-green back with silver sides." },

  // --- TROUT VARIATIONS ---
  "Brown trout": { limit: "Varies", minSize: "none", idTip: "Golden-brown with large black spots (often with pale halos)." },
  "Rainbow trout": { limit: "Varies", minSize: "none", idTip: "Silvery with a pink lateral stripe; black spots on dorsal fin and tail." },
  "Eastern brook trout": { limit: "Varies", minSize: "none", idTip: "Dark green back with worm-like markings; red-orange spots with blue halos." },
  "Westslope cutthroat trout": { limit: "Varies", minSize: "none", idTip: "Distinctive red-orange slash on underside of jaw." },
  "Coastal cutthroat trout": { limit: "Varies", minSize: "none", idTip: "Olive back; small black spots and a red-orange slash on underside of jaw." },
  "Kokanee salmon": { limit: "Varies", minSize: "none", idTip: "Landlocked sockeye: blue back and silver sides; no distinct dark spots." },

  // --- SALTWATER & BENTHIC ---
  "Lingcod": { limit: "1/day (Slot Limit)", minSize: "26\"", idTip: "Mottled brown-green body; large mouth with sharp canine-like teeth." },
  "Pacific cod": { limit: "Varies", minSize: "none", idTip: "Brown-olive mottled body with three dorsal fins and a small chin barbel." },
  "Cabezon": { limit: "Varies", minSize: "none", idTip: "Mottled reddish-brown body with large broad pectoral fins; no scales." },
  "Pacific halibut": { limit: "1/day", minSize: "32\"", idTip: "Flatfish: brown-green top side, white underside; small mouth." },

  // --- SHELLFISH & INVERTEBRATES ---
  "Dungeness crab": { limit: "5/day (PS)", minSize: "6.25\"", idTip: "Broad brown shell; males have white-tipped claws." },
  "Red rock crab": { limit: "6/day", minSize: "5\"", idTip: "Reddish-brown shell; claws tipped in black." },
  "Signal crayfish": { limit: "10 lbs", minSize: "3.25\"", idTip: "Uniform brownish; smooth claws with white at the joints." },
  "Pacific razor clam": { limit: "15/day", minSize: "none", idTip: "Long fragile clam with thin shiny tan shell." },
  "Spot shrimp": { limit: "80/day", minSize: "none", idTip: "Large bright red shrimp with white stripe along the back." },
  "Market squid": { limit: "No limit", minSize: "none", idTip: "Tapered body with fins along sides; semitransparent." },
};

export const ALL_SPECIES = Object.keys(FISH_GUIDE).sort();