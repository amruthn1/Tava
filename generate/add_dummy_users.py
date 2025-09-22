import firebase_admin
from firebase_admin import credentials, firestore
import time
import random
from collections import defaultdict

SAMPLE_NAMES = [
    "Alice Johnson", "Bob Smith", "Carol Williams", "David Brown", "Eva Davis",
    "Frank Miller", "Grace Wilson", "Hank Moore", "Ivy Taylor", "Jack Anderson",
    "Kara Thomas", "Liam Jackson", "Mia White", "Noah Harris", "Olivia Martin",
    "Paul Thompson", "Quinn Garcia", "Rachel Martinez", "Sam Robinson", "Tina Clark",
    "Uma Rodriguez", "Victor Lewis", "Wendy Lee", "Xander Walker", "Yara Hall",
    "Zane Allen", "Amy Young", "Ben King", "Cathy Wright", "Derek Scott",
    "Ella Green", "Fred Adams", "Gina Baker", "Harry Nelson", "Isla Carter",
    "Jake Mitchell", "Kylie Perez", "Leo Roberts", "Maya Turner", "Nate Phillips",
    "Opal Campbell", "Pete Parker", "Queen Simmons", "Ray Evans", "Sara Edwards",
    "Tom Collins", "Ursula Stewart", "Vince Morris", "Will Rogers", "Xenia Reed",
    "Yusuf Cook", "Zara Morgan", "Aaron Bell", "Bella Murphy", "Caleb Bailey",
    "Diana Rivera", "Ethan Cooper", "Fiona Richardson", "Gabe Cox", "Holly Howard",
    "Ian Ward", "Jade Brooks", "Kyle Bennett", "Lara Gray", "Mark James",
    "Nina Watson", "Owen Brooks", "Penny Kelly", "Quincy Sanders", "Rose Price"
]

TECH_PROJECTS = [
    ("AI-Powered Medical Diagnosis System", "Develop an AI/ML system that analyzes medical images and patient data to assist doctors in diagnosing diseases with high accuracy, leveraging deep learning and computer vision techniques."),
    ("Smart Home Automation with Embedded Systems", "Design an embedded system-based smart home automation platform that integrates sensors and actuators to enable energy-efficient control and monitoring of household devices."),
    ("Real-Time Traffic Prediction using Machine Learning", "Implement a software solution that collects and analyzes traffic data in real-time to predict congestion patterns, optimizing routing and reducing commute times."),
    ("Low-Power IoT Sensor Network", "Create an embedded IoT sensor network optimized for low power consumption, capable of long-term environmental monitoring and data transmission using wireless protocols."),
    ("Electrical Vehicle Battery Management System", "Develop an electrical engineering project focusing on the design and implementation of a battery management system to monitor and optimize EV battery performance and safety."),
    ("Natural Language Processing Chatbot", "Build an AI-driven chatbot utilizing advanced NLP techniques to understand and respond to user queries in natural language, enhancing user interaction."),
    ("Autonomous Drone Navigation", "Design and implement embedded software and control algorithms for autonomous drone navigation, including obstacle detection and path planning."),
    ("Renewable Energy Grid Integration", "Engineer a system to integrate renewable energy sources into the electrical grid, managing load balancing and energy storage using smart grid technologies."),
    ("Computer Vision-Based Quality Inspection", "Develop a computer vision system for automated quality inspection in manufacturing, detecting defects and ensuring product standards."),
    ("Wearable Health Monitoring Device", "Create an embedded system wearable device that continuously monitors vital health parameters and provides real-time feedback to users and healthcare providers."),
    ("Blockchain-Based Voting System", "Develop a secure and transparent blockchain voting platform to enhance election integrity and voter trust."),
    ("Augmented Reality Educational App", "Design an AR app that enhances learning experiences by overlaying interactive 3D models onto real-world environments."),
    ("Cybersecurity Threat Detection", "Implement a machine learning system to detect and respond to cybersecurity threats in real-time."),
    ("Smart Agriculture Monitoring System", "Create an IoT-based system to monitor soil moisture, temperature, and crop health for precision farming."),
    ("Autonomous Vehicle Control Algorithms", "Develop control algorithms for self-driving cars focusing on safety and efficiency."),
    ("Cloud-Based Data Analytics Platform", "Build a scalable cloud platform for big data processing and visualization."),
    ("3D Printing Optimization Software", "Design software to optimize 3D printing parameters for improved quality and speed."),
    ("Energy Harvesting Wearable Device", "Develop a wearable device that harvests energy from body movements to power sensors."),
    ("AI-Powered Financial Advisor", "Create an AI system that provides personalized financial advice based on user data."),
    ("Smart Traffic Light Control System", "Implement an adaptive traffic light system that optimizes flow based on real-time data."),
    ("Virtual Reality Therapy Platform", "Develop a VR platform for therapeutic applications such as phobia treatment and rehabilitation."),
    ("IoT-Based Smart Parking System", "Design a system that detects available parking spots and guides drivers accordingly."),
    ("Machine Learning for Predictive Maintenance", "Implement ML models to predict equipment failures and schedule maintenance."),
    ("Robotic Arm Control System", "Develop control software for a robotic arm for manufacturing automation."),
    ("AI-Driven Content Recommendation Engine", "Build a recommendation system that personalizes content based on user preferences."),
    ("Embedded System for Wearable Fitness Tracker", "Create firmware for a fitness tracker that monitors physical activity and health metrics."),
    ("Smart Energy Meter with Blockchain", "Design a blockchain-enabled smart meter for secure energy transactions."),
    ("AI-Based Language Translation Device", "Develop a portable device that provides real-time language translation."),
    ("IoT-Enabled Disaster Management System", "Build a system that uses IoT sensors to detect and respond to natural disasters."),
    ("Autonomous Underwater Vehicle Navigation", "Design navigation algorithms for underwater drones."),
    ("Smart Waste Management System", "Implement sensors and software to optimize waste collection routes."),
    ("AI-Powered Resume Screening Tool", "Create a tool that automates the screening of job applications."),
    ("Embedded System for Smart Glasses", "Develop software for smart glasses that provide augmented information."),
    ("Cloud-Based Collaborative Coding Platform", "Build a platform that enables real-time collaborative coding."),
    ("AI-Driven Personalized Learning Platform", "Design a platform that adapts educational content to individual learners."),
    ("Smart Grid Demand Response System", "Implement a system to manage electricity demand in smart grids."),
    ("IoT-Based Air Quality Monitoring", "Create a network of sensors to monitor and report air quality."),
    ("AI-Powered Fraud Detection System", "Develop models to detect fraudulent transactions in financial systems."),
    ("Embedded System for Autonomous Robots", "Design control software for robots performing autonomous tasks."),
    ("Smart Inventory Management System", "Build a system that tracks inventory levels using IoT devices."),
    ("AI-Based Traffic Sign Recognition", "Implement a computer vision system to recognize traffic signs for autonomous vehicles."),
    ("Wearable Device for Sleep Monitoring", "Create a device that tracks sleep patterns and provides insights."),
    ("Blockchain-Based Supply Chain Management", "Develop a blockchain solution to enhance supply chain transparency."),
    ("AI-Powered Customer Support Chatbot", "Build a chatbot that handles customer queries with natural language understanding."),
    ("Embedded System for Smart Thermostat", "Design firmware for a thermostat that learns user preferences."),
    ("Machine Learning for Healthcare Diagnostics", "Implement ML models to assist in medical diagnosis."),
    ("IoT-Enabled Smart Lighting System", "Create a lighting system that adjusts based on occupancy and daylight."),
    ("AI-Based Image Captioning System", "Develop a system that generates captions for images automatically."),
    ("Embedded System for Drone Delivery", "Design control software for drones delivering packages."),
    ("Smart Water Management System", "Implement sensors and software to optimize water usage in agriculture."),
    ("AI-Powered Social Media Analytics", "Build tools to analyze social media trends and sentiment."),
    ("Embedded System for Industrial Automation", "Develop software for automating industrial processes."),
    ("AI-Based Personalized Marketing Platform", "Create a platform that personalizes marketing campaigns."),
    ("IoT-Enabled Smart Refrigerator", "Design a refrigerator that monitors contents and suggests shopping lists."),
    ("Autonomous Lawn Mower Robot", "Develop control algorithms for a robot that mows lawns automatically."),
    ("AI-Powered Speech Recognition System", "Implement a system that transcribes speech to text accurately."),
    ("Embedded System for Smart Locks", "Create firmware for locks controlled via smartphones."),
    ("Machine Learning for Stock Market Prediction", "Build models to predict stock price movements."),
    ("IoT-Based Elderly Care System", "Design a system to monitor and assist elderly individuals at home."),
    ("AI-Powered Video Surveillance", "Develop a system that detects suspicious activities in video feeds."),
    ("Embedded System for Smart Bicycle", "Create software for a bicycle that tracks usage and location."),
    ("Smart Retail Checkout System", "Implement a checkout system using computer vision and AI."),
    ("AI-Based Disaster Response Coordination", "Build a platform to coordinate disaster response efforts."),
    ("IoT-Enabled Smart Gym Equipment", "Design gym equipment that tracks workouts and provides feedback."),
    ("Embedded System for Smart Agriculture Drone", "Develop control software for drones used in agriculture."),
    ("AI-Powered Legal Document Analysis", "Create tools that analyze legal documents for key information."),
    ("Smart City Traffic Management System", "Implement a system to optimize traffic flow in urban areas."),
    ("AI-Based Personalized Nutrition App", "Build an app that provides nutrition advice based on user data."),
    ("Embedded System for Smart Parking Meters", "Design firmware for parking meters that accept digital payments."),
    ("IoT-Enabled Environmental Monitoring", "Create a sensor network to monitor environmental conditions."),
    ("AI-Powered Music Recommendation System", "Develop a system that recommends music based on listening habits."),
    ("Embedded System for Smart Alarm System", "Build software for an alarm system with remote monitoring."),
    ("AI-Based Automated Essay Scoring", "Implement models that score essays automatically."),
    ("IoT-Enabled Smart Trash Bins", "Design bins that monitor fill levels and optimize collection."),
    ("AI-Powered Virtual Personal Trainer", "Create a virtual trainer that provides workout guidance."),
    ("Embedded System for Smart Traffic Cameras", "Develop software for cameras that monitor traffic conditions.")
]

INTEREST_TOPICS = [
    "AI", "Machine Learning", "Data Science", "Computer Vision", "Robotics",
    "Natural Language Processing", "Cybersecurity", "Embedded Systems", "IoT",
    "Cloud Computing", "AR/VR", "Mobile Apps", "Web Development", "Backend Systems",
    "Frontend/UI", "Product Management", "Entrepreneurship", "Open Source",
    "Education Tech", "Healthcare Tech", "Fintech", "Gaming", "Sustainability",
    "Blockchain", "3D Printing"
]

WL_LOCATIONS = [
    {"label": "Purdue Memorial Union", "latitude": 40.4236, "longitude": -86.9113},
    {"label": "Engineering Fountain", "latitude": 40.4282, "longitude": -86.9136},
    {"label": "France A. Cordova Recreational Sports Center (CoRec)", "latitude": 40.4276, "longitude": -86.9212},
    {"label": "McCutcheon Hall", "latitude": 40.4248, "longitude": -86.9282},
    {"label": "Cary Quadrangle", "latitude": 40.4287, "longitude": -86.9148},
    {"label": "Earhart Hall", "latitude": 40.4302, "longitude": -86.9179},
    {"label": "Windsor Halls", "latitude": 40.4241, "longitude": -86.9190},
    {"label": "Hillenbrand Hall", "latitude": 40.4231, "longitude": -86.9280},
    {"label": "First Street Towers", "latitude": 40.4210, "longitude": -86.9232},
    {"label": "Honors College and Residences", "latitude": 40.4245, "longitude": -86.9215},
    {"label": "Discovery Park", "latitude": 40.4189, "longitude": -86.9363},
    {"label": "Neil Armstrong Hall of Engineering", "latitude": 40.4270, "longitude": -86.9147},
    {"label": "Ross–Ade Stadium", "latitude": 40.4347, "longitude": -86.9165},
    {"label": "Mackey Arena", "latitude": 40.4340, "longitude": -86.9160},
    {"label": "Purdue University Airport", "latitude": 40.4123, "longitude": -86.9369},
    {"label": "Tapawingo Park", "latitude": 40.4177, "longitude": -86.9023},
    {"label": "Wabash Landing", "latitude": 40.4185, "longitude": -86.9054},
    {"label": "Celery Bog Nature Area", "latitude": 40.4660, "longitude": -86.9365},
    {"label": "Happy Hollow Park", "latitude": 40.4468, "longitude": -86.9111},
    {"label": "Chauncey Village", "latitude": 40.4247, "longitude": -86.9086},
    {"label": "Northwestern Ave & Stadium Ave", "latitude": 40.4315, "longitude": -86.9145},
    {"label": "Village West Apartments", "latitude": 40.4309, "longitude": -86.9315},
]

def _jitter(lat, lon, max_delta=0.0008):
    return lat + random.uniform(-max_delta, max_delta), lon + random.uniform(-max_delta, max_delta)

def _random_from_pool(pool):
    base = random.choice(pool)
    lat, lon = _jitter(base["latitude"], base["longitude"])
    return {"label": base["label"], "latitude": lat, "longitude": lon}

def random_wl_location():
    """Pick a random WL location and add slight jitter so points vary naturally."""
    return _random_from_pool(WL_LOCATIONS)

UIUC_LOCATIONS = [
    {"label": "Grainger Engineering Library (UIUC)", "latitude": 40.1120, "longitude": -88.2262},
    {"label": "Illini Union (UIUC)", "latitude": 40.1098, "longitude": -88.2272},
    {"label": "Siebel Center for CS (UIUC)", "latitude": 40.1138, "longitude": -88.2249},
]

UMICH_LOCATIONS = [
    {"label": "Michigan Union (UMich)", "latitude": 42.2767, "longitude": -83.7413},
    {"label": "EECS Building (UMich)", "latitude": 42.2931, "longitude": -83.7133},
]

NORTHWESTERN_LOCATIONS = [
    {"label": "Technological Institute (Northwestern)", "latitude": 42.0586, "longitude": -87.6751},
    {"label": "Norris University Center (Northwestern)", "latitude": 42.0536, "longitude": -87.6773},
]

UCHICAGO_LOCATIONS = [
    {"label": "Regenstein Library (UChicago)", "latitude": 41.7897, "longitude": -87.5997},
    {"label": "Saieh Hall (UChicago)", "latitude": 41.7907, "longitude": -87.5988},
]

def build_assigned_locations(num_users):
    """Assign locations so markers are spread out and mostly unique.

    - First 2 users: UIUC
    - Next 1: UMich
    - Next 1: Northwestern
    - Next 1: UChicago
    - Remaining: sample WL locations without replacement when possible
    """
    assigned = []
    for _ in range(min(2, num_users)):
        assigned.append(_random_from_pool(UIUC_LOCATIONS))
    if len(assigned) < num_users:
        assigned.append(_random_from_pool(UMICH_LOCATIONS))
    if len(assigned) < num_users:
        assigned.append(_random_from_pool(NORTHWESTERN_LOCATIONS))
    if len(assigned) < num_users:
        assigned.append(_random_from_pool(UCHICAGO_LOCATIONS))

    remaining = max(0, num_users - len(assigned))
    if remaining > 0:
        base_choices = WL_LOCATIONS.copy()
        random.shuffle(base_choices)
        chosen = base_choices[:min(remaining, len(base_choices))]
        while len(chosen) < remaining:
            chosen.append(random.choice(WL_LOCATIONS))
        for base in chosen:
            lat, lon = _jitter(base["latitude"], base["longitude"])
            assigned.append({"label": base["label"], "latitude": lat, "longitude": lon})

    return assigned[:num_users]

SERVICE_ACCOUNT_KEY = "serviceAccountKey.json"
NUM_USERS = 15
POSTS_PER_USER = 1

cred = credentials.Certificate(SERVICE_ACCOUNT_KEY)
firebase_admin.initialize_app(cred)
db = firestore.client()

def add_dummy_users_and_posts():
    user_ids = []
    post_ids = []
    post_author = {}
    user_posts_map = {}

    assigned_locations = build_assigned_locations(NUM_USERS)

    # Step 1: Create users
    for i in range(NUM_USERS):
        name = SAMPLE_NAMES[i]
        project = TECH_PROJECTS[i]
        user_id = name.lower().replace(" ", "_")
        looking_for_cofounder = random.choice([True, False])
        num_people_needed = random.randint(1, 5)
        skills_needed = random.sample(
            ["AI/ML", "Embedded Systems", "Electrical Engineering", "Full-Stack Development", "Data Science", "Computer Vision", "Cybersecurity", "Cloud Computing"],
            k=random.randint(1, 3)
        )
        assigned_loc = assigned_locations[i]
        assigned_geo = firestore.GeoPoint(assigned_loc["latitude"], assigned_loc["longitude"])
        interests = random.sample(INTEREST_TOPICS, k=random.randint(2, 4))
        user_data = {
            "displayName": name,
            "email": f"{name}@purdue.edu",
            "createdAt": int(time.time() * 1000),
            "ideaTitle": project[0],
            "ideaDescription": project[1],
            "likedPosts": [],
            "passedPosts": [],
            "lookingForCofounder": looking_for_cofounder,
            "numPeopleNeeded": num_people_needed,
            "skillsNeeded": skills_needed,
            "connections": [], 
            "location": assigned_loc,
            "locationGeo": assigned_geo,
            "interests": interests,
        }
        db.collection("users").document(user_id).set(user_data)
        user_ids.append(user_id)
        user_posts_map[user_id] = []
        print(f"Added user {user_id}")

    for i, user_id in enumerate(user_ids):
        name = SAMPLE_NAMES[i]
        project = TECH_PROJECTS[i]
        user_doc = db.collection("users").document(user_id).get().to_dict()
        looking_for_cofounder = user_doc.get("lookingForCofounder")
        num_people_needed = user_doc.get("numPeopleNeeded")
        skills_needed = user_doc.get("skillsNeeded")
        assigned_loc = user_doc.get("location") or assigned_locations[i]
        assigned_geo = firestore.GeoPoint(assigned_loc["latitude"], assigned_loc["longitude"])

        for j in range(POSTS_PER_USER):
            post_data = {
                "authorId": user_id,
                "createdAt": firestore.SERVER_TIMESTAMP,
                "title": project[0],
                "description": project[1],
                "peopleNeeded": num_people_needed,
                "lookingForCofounder": looking_for_cofounder,
                "skillsNeeded": skills_needed,
                "location": assigned_loc,
                "locationGeo": assigned_geo,
                "personType": random.choice(["Dev", "Designer", "PM"])
            }
            post_ref = db.collection("posts").add(post_data)[1]
            post_ids.append(post_ref.id)
            post_author[post_ref.id] = user_id
            user_posts_map[user_id].append(post_ref.id)
        print(f"📝 Added {POSTS_PER_USER} posts for {user_id}")

    post_liked_by = defaultdict(list)
    post_passed_by = defaultdict(list)
    likes_by_user = {}
    passes_by_user = {}
    direct_by_user = {uid: set() for uid in user_ids}

    for user_id in user_ids:
        candidates = [pid for pid in post_ids if post_author[pid] != user_id]
        if not candidates:
            liked = []
            passed = []
        else:
            like_k = random.randint(1, min(5, len(candidates)))
            liked = random.sample(candidates, k=like_k)
            remaining = [pid for pid in candidates if pid not in liked]
            pass_k = random.randint(1, min(5, len(remaining))) if remaining else 0
            passed = random.sample(remaining, k=pass_k) if pass_k > 0 else []

        likes_by_user[user_id] = liked
        passes_by_user[user_id] = passed

        liked_users = list({post_author[pid] for pid in liked})
        passed_users = list({post_author[pid] for pid in passed})
        db.collection("users").document(user_id).update({
            "likedPosts": liked,
            "passedPosts": passed,
            "dismissedPosts": passed,  
            "likedUsers": liked_users,
            "passedUsers": passed_users,
            "liked": liked_users, 
        })

        direct_by_user[user_id].update(liked_users)
        direct_by_user[user_id].update(passed_users)

        for pid in liked:
            post_liked_by[pid].append(user_id)
        for pid in passed:
            post_passed_by[pid].append(user_id)

        print(f"Updated {user_id} with {len(liked)} liked & {len(passed)} passed posts")

    conn_by_user = {uid: set() for uid in user_ids}
    for u in user_ids:
        for v in direct_by_user[u]:
            if u == v:
                continue
            conn_by_user[u].add(v)
            conn_by_user[v].add(u)

    extended_by_user = {uid: set() for uid in user_ids}
    for u in user_ids:
        first = conn_by_user[u]
        second = set()
        for v in first:
            second.update(conn_by_user[v])
        second.discard(u)
        second.difference_update(first)
        extended_by_user[u] = second

    for u in user_ids:
        db.collection("users").document(u).update({
            "connections": sorted(list(conn_by_user[u])),
            "extendedConnections": sorted(list(extended_by_user[u])),
            "extended": sorted(list(extended_by_user[u])),  
            "connectionsGraph": {
                "direct": sorted(list(conn_by_user[u])),
                "extended": sorted(list(extended_by_user[u]))
            }
        })
        print(f"🔗 {u}: {len(conn_by_user[u])} direct, {len(extended_by_user[u])} extended")

    for pid in post_ids:
        db.collection("posts").document(pid).update({
            "likedBy": post_liked_by.get(pid, []),
            "passedBy": post_passed_by.get(pid, [])
        })

    print(f"\n🎉 Done! {NUM_USERS} users + {NUM_USERS*POSTS_PER_USER} posts added, with likes/passes and connections.")

if __name__ == "__main__":
    add_dummy_users_and_posts()
    print(f"\n🎉 Done! {NUM_USERS} users + {NUM_USERS*POSTS_PER_USER} posts added, with likes/passes linked.")
