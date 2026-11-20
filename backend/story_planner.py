from typing import List, Dict

STORY_TEMPLATES = {
    "travel_rajasthan": [
        {"role": "The Opening Hook", "theme": "Sunrise over Jaipur & Nahargarh Fort", "duration": 24, "script": "As morning mist lifts over the Aravalli hills, Rajasthan awakens in a wash of amber and gold. This isn't just history—it's a living empire of colors and legends."},
        {"role": "Royal Heritage & Bastions", "theme": "Majestic Amber Fort & Elephant Gate", "duration": 24, "script": "Carved from sandstone and marble, Amber Fort stands as an unyielding sentinel. Its labyrinth of mirrored halls whispers stories of royal triumphs and forgotten courtly intrigue."},
        {"role": "Architectural Wonder", "theme": "Hawa Mahal - Palace of Winds", "duration": 24, "script": "In the bustling heart of the Pink City stands Hawa Mahal. With 953 honeycomb windows, it was designed to let royal women witness street festivals without ever being seen."},
        {"role": "Courtly Splendor", "theme": "City Palace Courtyards & Peacock Gate", "duration": 24, "script": "The City Palace remains an opulent blend of Rajasthani and Mughal mastery. Each ornate archway and mosaic peacock celebrates centuries of royal craftsmanship."},
        {"role": "Cultural Deep-Dive", "theme": "Jodhpur - The Blue City Alleys", "duration": 24, "script": "Further west lies Jodhpur, where narrow alleys wind beneath indigo-washed facades. The blue mineral wash kept homes cool through blistering desert summers and unified the historic quarters."},
        {"role": "Citadel of the Sun", "theme": "Mehrangarh Fort Cliffs & Bastions", "duration": 24, "script": "Towering 400 feet above the desert floor, Mehrangarh Fort commands the horizon. Built upon sheer volcanic rock, it stands among the most formidable citadels in the subcontinent."},
        {"role": "Sacred Waters & Solitude", "theme": "Pushkar Holy Lake & Desert Temples", "duration": 24, "script": "Surrounded by 52 bathing ghats and rare shrines, Pushkar is a sanctuary of serene reflection, drawing wanderers and pilgrims to its tranquil sacred waters."},
        {"role": "Venice of the East", "theme": "Udaipur Lake Pichola & Floating Palaces", "duration": 24, "script": "In southern Rajasthan, the white marble pavilions of Udaipur float gracefully upon Lake Pichola, offering a shimmering romantic contrast to the arid dunes."},
        {"role": "The Great Thar", "theme": "Sam Sand Dunes of Jaisalmer", "duration": 24, "script": "Heading deep into the Thar desert near Jaisalmer, ripples of golden sand stretch to the horizon, shaped perpetually by desert winds and camel caravans."},
        {"role": "The Sunset Finale", "theme": "Desert Sunset & Rajasthani Folk Rhythm", "duration": 24, "script": "As the desert sun dips beneath the golden dunes, folk melodies echo through the twilight breeze. Rajasthan lingers in the memory—timeless, proud, and forever unforgettable."}
    ]
}

def plan_story_format_a(sources: List[Dict], topic: str, voiceover_enabled: bool) -> Dict:
    """
    Plans a coherent 4-minute story sequence using all 10 sources.
    Allocates chapters, pacing, and either voiceover script or on-screen captions.
    Target total duration: 240 seconds (4:00).
    """
    chapters = []
    current_time = 0.0
    template_items = STORY_TEMPLATES.get("travel_rajasthan", [])

    for i in range(10):
        src = sources[i] if i < len(sources) else {"title": f"Highlight {i+1}", "id": f"src_{i+1}"}
        template = template_items[i] if i < len(template_items) else {
            "role": f"Chapter {i+1}",
            "theme": src.get("title", f"Location {i+1}"),
            "duration": 24,
            "script": f"Exploring {src.get('title', 'the scenic wonders')} with captivating perspectives and history."
        }

        duration = template["duration"]
        start_t = current_time
        end_t = current_time + duration
        current_time = end_t

        # If voiceover is disabled, use concise on-screen display text
        if not voiceover_enabled:
            caption_text = f"📍 {template['theme']} | {template['role']}"
            display_script = f"Discover the iconic beauty of {template['theme']}."
        else:
            caption_text = template["script"]
            display_script = template["script"]

        chapters.append({
            "index": i + 1,
            "role": template["role"],
            "title": template["theme"],
            "source_id": src.get("video_id", f"src_{i+1}"),
            "source_title": src.get("title", template["theme"]),
            "start_time": start_t,
            "end_time": end_t,
            "duration": duration,
            "script": display_script,
            "caption": caption_text,
            "visual_direction": f"Pan and reveal across {template['theme']}; transition with smooth crossfade."
        })

    # Complete publishing package for Format A
    clean_topic = topic.strip() if topic else "Rajasthan Travel"
    metadata = {
        "title": f"{clean_topic.title()} (4K Cinematic Journey) | Full Documentary",
        "description": (
            f"Experience an unforgettable 4-minute journey through {clean_topic}. "
            f"From the sunrise fortresses of Jaipur to the hidden blue alleyways of Jodhpur, "
            f"the serene waters of Udaipur, and the golden Thar desert sunset in Jaisalmer. "
            f"Carefully curated across 10 iconic locations with full historical insights and authentic soundscapes.\n\n"
            f"Chapters:\n" + "\n".join([f"{int(c['start_time']//60):02d}:{int(c['start_time']%60):02d} - {c['title']}" for c in chapters]) +
            f"\n\n#Rajasthan #TravelDocumentary #IncredibleIndia #4KTravel #Heritage"
        ),
        "hashtags": ["#RajasthanTravel", "#CinematicTravel", "#IncredibleIndia", "#4KDocumentary", "#TravelStories"],
        "tags": ["rajasthan travel", "cinematic travel", "jaipur tourist places", "jodhpur blue city", "udaipur lake pichola", "jaisalmer desert", "travel documentary", "4k places to visit", "india travel guide"]
    }

    return {
        "format": "format_a_4min",
        "total_target_duration": 240,
        "chapters": chapters,
        "metadata": metadata
    }

def plan_shorts_format_b(sources: List[Dict], topic: str, voiceover_enabled: bool) -> List[Dict]:
    """
    Plans 10 separate YouTube Shorts (9:16), one for each approved source.
    Duration 30 seconds each (within the 20-60s requirement).
    """
    shorts = []
    template_items = STORY_TEMPLATES.get("travel_rajasthan", [])

    short_hooks = [
        {"hook": "This sunrise spot in Jaipur doesn't feel real! 🌅", "fact": "Perched on the edge of the Aravalli hills, Nahargarh Fort gives you the most epic panoramic view in Rajasthan."},
        {"hook": "Inside the impenetrable 400-year-old Amber Fort 🏰", "fact": "Its walls stretch across the mountain ridge like the Great Wall of India, protecting royal marble halls."},
        {"hook": "Why does this palace have 953 windows?! 🌬️", "fact": "Hawa Mahal was built like a honeycomb so royal women could watch city street festivals in complete privacy."},
        {"hook": "The royal Peacock Gate in Jaipur's City Palace 🦚", "fact": "Crafted with thousands of vibrant glass mosaics representing the autumn season and Lord Krishna."},
        {"hook": "Why is Jodhpur painted entirely BLUE?! 💙", "fact": "Locals coated their homes with copper sulfate and limestone to repel insects and keep rooms cool in 45°C heat."},
        {"hook": "The fortress that NO ENEMY could ever breach! 🛡️", "fact": "Mehrangarh Fort rises 400 feet into the sky. Rudyard Kipling called it 'the work of giants and angels.'"},
        {"hook": "The mysterious sacred desert lake of Pushkar 🕊️", "fact": "Surrounded by 52 bathing ghats and one of the only Brahma temples in the entire world."},
        {"hook": "This floating palace in Udaipur was built for kings 🛶", "fact": "Lake Pichola's white marble island palaces create an unreal mirage reflecting across the tranquil water."},
        {"hook": "Getting lost in the golden dunes of Jaisalmer 🐪", "fact": "Miles of untouched sand dunes shifting with the desert wind under an endless starry desert sky."},
        {"hook": "Rajasthan desert sunsets will leave you speechless! 🏜️", "fact": "As folk musicians sing ancient ballads, the sun turns the golden sands into burning crimson. Pure magic."}
    ]

    for i in range(10):
        src = sources[i] if i < len(sources) else {"title": f"Source {i+1}", "id": f"src_{i+1}"}
        info = short_hooks[i % len(short_hooks)]
        
        hook = info["hook"]
        fact = info["fact"]
        location_title = template_items[i]["theme"] if i < len(template_items) else src.get("title", f"Location {i+1}")
        
        script = f"{hook} {fact} Save this for your next adventure to Rajasthan!" if voiceover_enabled else f"📍 {location_title}\n{hook}"
        
        short_num = i + 1
        title = f"{hook.split('!')[0].split('?')[0]} #Shorts"
        
        desc = (
            f"{hook}\n\n"
            f"{fact}\n\n"
            f"Location: {location_title}\n"
            f"Part {short_num} of 10 in our Rajasthan highlights series.\n\n"
            f"#Shorts #Rajasthan #Travel #IncredibleIndia"
        )

        shorts.append({
            "index": short_num,
            "source_id": src.get("video_id", f"src_{short_num}"),
            "source_title": src.get("title", location_title),
            "target_duration": 30,
            "aspect_ratio": "9:16",
            "hook": hook,
            "fact": fact,
            "script": script,
            "metadata": {
                "title": title,
                "description": desc,
                "hashtags": ["#Shorts", "#Rajasthan", "#TravelShorts", "#ExploreIndia"],
                "tags": [location_title.lower(), "rajasthan travel", "shorts", "travel highlights", "viral travel", "incredible india"]
            }
        })

    return shorts
