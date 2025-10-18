import requests

print(requests.get(
    "http://127.0.0.1:6767/api/generate_mcq",
    headers={"X-Num-Questions": "3", "X-Topic" : "Seattle Mariners"}
).content)