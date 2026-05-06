#!/usr/bin/env python3
"""
Verifies that the alphabetically latest .sql file in this directory
is referenced by the last sql_file-bearing entry in run_all_migrations().
Exit 0 = OK, Exit 1 = mismatch.
"""
import ast
import os
import sys

MIGRATIONS_DIR = os.path.dirname(os.path.abspath(__file__))
RUNNER_FILE = os.path.join(MIGRATIONS_DIR, "migration_runner.py")


def extract_last_sql_file(path: str) -> str | None:
    """Use ast (not import) to find the last 'sql_file' value in run_all_migrations()."""
    with open(path, encoding="utf-8") as f:
        tree = ast.parse(f.read())
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef) or node.name != "run_all_migrations":
            continue
        for stmt in ast.walk(node):
            if not isinstance(stmt, ast.Assign) or not isinstance(stmt.value, ast.List):
                continue
            last = None
            for elt in stmt.value.elts:
                if not isinstance(elt, ast.Dict):
                    continue
                for k, v in zip(elt.keys, elt.values):
                    if (
                        isinstance(k, ast.Constant)
                        and k.value == "sql_file"
                        and isinstance(v, ast.Constant)
                    ):
                        last = v.value  # keep overwriting — last one wins
            if last:
                return last
    return None


def latest_on_disk(d: str) -> str | None:
    files = sorted(f for f in os.listdir(d) if f.endswith(".sql"))
    return files[-1] if files else None


def main() -> int:
    registered = extract_last_sql_file(RUNNER_FILE)
    on_disk = latest_on_disk(MIGRATIONS_DIR)

    if not registered:
        print("ERROR: No sql_file entries found in run_all_migrations().")
        return 1
    if not on_disk:
        print("ERROR: No .sql files found in migrations directory.")
        return 1

    if registered == on_disk:
        print(f"OK  Migration check passed: {on_disk}")
        return 0

    print("FAIL  Migration consistency check FAILED\n")
    print(f"  Latest .sql file on disk : {on_disk}")
    print(f"  Last sql_file in runner  : {registered}\n")
    print("Add the following entry at the end of run_all_migrations():\n")
    print("    {")
    print('        "name": "NNN_your_migration_name",')
    print('        "description": "...",')
    print(f'        "sql_file": "{on_disk}"')
    print("    },")
    return 1


if __name__ == "__main__":
    sys.exit(main())
