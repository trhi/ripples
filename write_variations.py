import json

data = {
    "boulder": {"ACTION": [
        "I edge a hair laterally, feeling the slow tug of ice and root pull.",
        "I soak rainfall, growing heavy, inching toward the stream bed.",
        "I resist the slide by nestling deeper into moss and root hold."
    ]},
    "pine": {"ACTION": [
        "I spill resin onto a wound, sealing insects out and memory in.",
        "I thrust a new shoot skyward, twisting around neighboring trunks for light.",
        "I drop a shower of needles to carpet the soil beneath me."
    ]},
    "ants-nest": {"ACTION": [
        "Workers stream out along a scent trail to haul back a berry.",
        "I seal a leaking chamber with mud before the rain pours in.",
        "I widen a tunnel to accommodate the queen’s swollen abdomen."
    ]},
    "mushroom": {"ACTION": [
        "I push my cap through the litter and open gills to damp air.",
        "I exude a fragrant mist to lure a beetle for spore transport.",
        "I rotward, collapsing and feeding the mycelium network below."
    ]},
    "cloud": {"ACTION": [
        "I stretch thin over the pines, shading the undergrowth from noon heat.",
        "I condense a drop and let it fall, hearing the thud on leaves.",
        "I drift eastward, merging with morning mist until I am indistinct."
    ]},
    "fern": {"ACTION": [
        "I unfurl a new frond into a sliver of shafted light.",
        "I send runners to encircle a damp log for anchorage.",
        "I gather dew on my hairs and draw it down to roots."
    ]},
    "blueberry": {"ACTION": [
        "I swell my berries toward a taste of sunlight and rain.",
        "I send a cane creeping along the moss, seeking richer earth.",
        "I release scent to call insects to my white blossoms."
    ]},
    "deer": {"ACTION": [
        "I step lightly through ferns toward a distant berry bush.",
        "I lift my head to scent the breeze for danger or sweetness.",
        "I paw damp soil, turning over roots in a rummage."
    ]},
    "lichen": {"ACTION": [
        "I spread a thin crust over bark, patient and unhurried.",
        "I drink mist from the morning air into my body.",
        "I send a fragment on wind, looking for new rock to claim."
    ]}
}

with open('variations.json', 'w') as f:
    json.dump(data, f, indent=2)

print('variations.json written with ACTION data')
