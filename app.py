from flask import Flask, render_template, send_from_directory
from pathlib import Path

app = Flask(__name__)

# ensure that we can reload when we change the HTML / JS for debugging
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.config['TEMPLATES_AUTO_RELOAD'] = True

@app.route('/')
def index():
    return render_template(
        "index.jinja", 
    )

@app.route('/favicon.ico')
def favicon():
    return send_from_directory(Path(app.root_path) / 'static' / 'assets', 'favicon.ico', mimetype='image/vnd.microsoft.icon')

@app.route('/GenericMobileSystemNuevo.ttf')
def font():
    return send_from_directory(Path(app.root_path) / 'static' / 'assets' / 'generic_mobile_system', 'GenericMobileSystemNuevo.ttf', mimetype='application/x-font-ttf')

if __name__ == '__main__':
    app.run()
