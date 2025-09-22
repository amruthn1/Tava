import firebase_admin
from firebase_admin import credentials, firestore

SERVICE_ACCOUNT_KEY = "serviceAccountKey.json"

cred = credentials.Certificate(SERVICE_ACCOUNT_KEY)
firebase_admin.initialize_app(cred)
db = firestore.client()

"""
This script deletes dummy users and their posts.

Previously, dummy users were assumed to have IDs that start with
"dummyUser", but our data used IDs derived from names like
"cathy_wright", "alice_johnson", etc. We now detect dummy users by
matching against the set of expected IDs generated from the same
SAMPLE_NAMES list used to create them, while still supporting the old
"dummyUser" prefix as a fallback.
"""

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

NUM_USERS = 70

def _expected_dummy_ids():
    """Generate the set of expected dummy user IDs from SAMPLE_NAMES."""
    ids = set()
    for name in SAMPLE_NAMES[:NUM_USERS]:
        ids.add(name.lower().replace(" ", "_"))
    return ids

def delete_dummy_users_and_posts():
    print("🗑️ Deleting dummy users and their posts...")

    users_ref = db.collection("users").stream()
    expected_ids = _expected_dummy_ids()

    dummy_user_ids = [u.id for u in users_ref if (u.id in expected_ids or u.id.startswith("dummyUser"))]

    if not dummy_user_ids:
        print("ℹ️ No dummy users found.")
        return

    for user_id in dummy_user_ids:
        posts = db.collection("posts").where("authorId", "==", user_id).stream()
        for post in posts:
            db.collection("posts").document(post.id).delete()
            print(f"Deleted post {post.id} from {user_id}")

    all_users = db.collection("users").stream()
    for user in all_users:
        user_doc = db.collection("users").document(user.id)
        data = user.to_dict()
        if "connections" in data:
            updated_connections = [uid for uid in data["connections"] if uid not in dummy_user_ids]
            if updated_connections != data["connections"]:
                user_doc.update({"connections": updated_connections})
                print(f"🔗 Updated connections for {user.id}, removed dummy users")

    for user_id in dummy_user_ids:
        db.collection("users").document(user_id).delete()
        print(f"Deleted user {user_id}")

    print(f"\nFinished deleting {len(dummy_user_ids)} dummy users and their posts.")

if __name__ == "__main__":
    delete_dummy_users_and_posts()