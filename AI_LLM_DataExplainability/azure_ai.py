from flask import Flask, request, jsonify, render_template
from datetime import datetime
import openai
import azure.cognitiveservices.speech as speechsdk

app = Flask(__name__)

# Hard-coded Azure OpenAI endpoint and API key
endpoint = "https://ai-edwardwongai3347632454095194.openai.azure.com/"
api_key = "0ff333ae82cd4660bd6fe954e9c3484c"
deployment = "gpt-4"

# Configure OpenAI with the endpoint and API key
openai.api_type = "azure"
openai.api_base = endpoint
openai.api_version = "2024-05-01-preview"
openai.api_key = api_key

# Configure Speech SDK with the subscription key and region
speech_key = "a9335a88502247f4b0ad9f7b37de7c76"
speech_region = "australiaeast"


def recognize_speech():
    speech_config = speechsdk.SpeechConfig(
        subscription=speech_key, region=speech_region
    )
    speech_recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config)

    print("Speak into your microphone...")
    result = speech_recognizer.recognize_once()

    if result.reason == speechsdk.ResultReason.RecognizedSpeech:
        return result.text
    elif result.reason == speechsdk.ResultReason.NoMatch:
        return "No speech could be recognized."
    elif result.reason == speechsdk.ResultReason.Canceled:
        cancellation_details = result.cancellation_details
        return f"Speech Recognition canceled: {cancellation_details.reason}"


@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")


@app.route("/chat", methods=["POST"])
def chat():
    try:
        user_input = request.form.get("input")
        # print(user_input)

        if not user_input:
            return jsonify({"error": "No input provided"}), 400

        # Generate a completion using Azure OpenAI
        response = openai.ChatCompletion.create(
            engine=deployment,
            messages=[{"role": "user", "content": user_input}],
            max_tokens=800,
            temperature=0.7,
            top_p=0.95,
            frequency_penalty=0,
            presence_penalty=0,
            stop=None,
        )

        # Extract the response from the completion
        response_content = response["choices"][0]["message"]["content"].strip()
        print(response_content)
        return render_template(
            "index.html", response=response_content, input=user_input
        )

    except Exception as e:
        # Log the exception details and return a 500 error
        print(f"An error occurred: {e}")
        return jsonify({"error": "An internal error occurred"}), 500


@app.route("/routing", methods=["POST"])
def routing():
    try:
        user_input = request.form.get("input")
        print(user_input)
        # Get the current date and time
        current_date = datetime.now().strftime("%Y-%m-%d")
        current_time = datetime.now().strftime("%H:%M")
        print(current_date, current_time)
        # Decide what type of action to do to update the prefix
        # Hard code to routing for now
        prefix = (
            f"I am currently in New Zealand Wellington, based on this message {user_input} "
            "determine the coordinates of the origin and destination coordinates response in similar format name - coordinates "
            "along that create a json payload that looks similar to this, use the estimated coordinates"
            f'{{"coordinates":{{"from":{{"name":"OriginPoint","lat":-41.261279,"lng":174.790819}},"to":{{"name":"DestinationPoint","lat":-41.290922,"lng":174.776472}}}},"stops":{{}},"travel_options":{{"max_changes":2,"walking_speed":4,"max_walking":2000}},"transport_modes":["Bus","Train","Ferry","Cable Car"],"date":"{current_date}","time":"{current_time}","when":"LeaveAfter","objective":"MostTimely"}}'
        )
        if not user_input:
            return jsonify({"error": "No input provided"}), 400

        # Generate a completion using Azure OpenAI
        response = openai.ChatCompletion.create(
            engine=deployment,
            messages=[{"role": "user", "content": prefix}],
            max_tokens=800,
            temperature=0.7,
            top_p=0.95,
            frequency_penalty=0,
            presence_penalty=0,
            stop=None,
            
        )

        # Extract the response from the completion
        response_content = response["choices"][0]["message"]["content"].strip()
        print(response_content)
        return render_template(
            "index.html", response=response_content, input=user_input
        )

    except Exception as e:
        # Log the exception details and return a 500 error
        print(f"An error occurred: {e}")
        return jsonify({"error": "An internal error occurred"}), 500


@app.route("/speech-to-text", methods=["GET"])
def speech_to_text():
    try:
        speech_text = recognize_speech()
        return jsonify({"text": speech_text})
    except Exception as e:
        print(f"An error occurred: {e}")
        return jsonify({"error": "Speech recognition failed"}), 500


if __name__ == "__main__":
    app.run(debug=True)
