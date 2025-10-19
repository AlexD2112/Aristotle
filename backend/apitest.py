import requests
a = requests.get("http://localhost:6767/api/get", headers={"X-Key":"40eb1348c81d41e1bdcda3eee5239cae","X-Num-Questions":"6"})
print(a.content)