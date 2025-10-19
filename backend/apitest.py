import requests
a = requests.get("http://localhost:6767/api/generate_mcq", headers={"X-Topic":"Chocolate chip cookies","X-Num-Questions":"6"})
print(a.content)