import requests, json

# json_to_save = json.loads(requests.get(
#     "http://127.0.0.1:6767/api/generate_mcq",
#     headers={"X-Num-Questions": "3", "X-Topic" : "Seattle Mariners"}
# ).content)
# print(json_to_save)
json_to_save = {
    "name": "Seattle Mariners",
    "description": "A test on the best team in the MLB!",
    "key": "QKqIZVAugxtArqXU",
    "questions": [
    {
    "type": "multiple-choice",
    "question": "Which player hit the most home runs for the Seattle Mariners in 2021?",
    "options": ["A: Ken Griffey Jr.", "B: Mitch Haniger", "C: J.P. Crawford", "D: Ty France"],
    "answer": [1],
    "explanation": "The correct answer is B because Mitch Haniger hit the most home runs for the Seattle Mariners in 2021."
    },
    {
    "type": "multiple-choice",
    "question": "Who was the manager of the Seattle Mariners in 2021?",
    "options": ["A: Scott Servais", "B: Bob Melvin", "C: Lloyd McClendon", "D: Jerry Dipoto"],
    "answer": [0],
    "explanation": "The correct answer is A because Scott Servais was the manager of the Seattle Mariners in 2021."
    },
    {
    "type": "multiple-choice",
    "question": "Which player won the American League MVP in 2021 while playing for the Seattle Mariners?",
    "options": ["A: George Springer", "B: Shohei Ohtani", "C: Julio Rodríguez", "D: Marcus Stroman"],
    "answer": [2],
    "explanation": "The correct answer is C because Julio Rodríguez won the American League MVP in 2021 while playing for the Seattle Mariners."
    }
    ]
}
topic = input("What topic would you like questions on? ")

jsonn = requests.get(
    "http://127.0.0.1:6767/api/generate_mcq",
    headers={"X-Num-Questions":"3","X-Topic":topic}
).content


a = requests.post(
    "http://127.0.0.1:6767/api/save",
    data=json.loads(jsonn),
    headers={"Content-Type":"application/json"}
)
print(a.content)
