from flask import Flask, send_file

app = Flask(__name__)

@app.route("/")
def index():
    return send_file("static_test.html")

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8082, debug=True)
