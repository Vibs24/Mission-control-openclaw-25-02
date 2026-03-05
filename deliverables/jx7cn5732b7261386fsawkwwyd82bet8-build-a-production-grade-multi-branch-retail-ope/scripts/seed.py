#!/usr/bin/env python3
import argparse

from app import create_app


def main():
    parser = argparse.ArgumentParser(description="Seed retail operations database")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Reset schema before seeding",
    )
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        if args.reset:
            app.init_db()
        app.seed_data()
    print("Seed complete")


if __name__ == "__main__":
    main()
