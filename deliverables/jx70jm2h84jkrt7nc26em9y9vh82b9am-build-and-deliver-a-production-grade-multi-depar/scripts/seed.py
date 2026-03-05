from app import create_app
app=create_app()
with app.app_context():
    app.seed_data()
print('seeded')
