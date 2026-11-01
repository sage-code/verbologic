"""Re-run generate-alphabet-content.py for the (language, entry) pairs that still fail check-alphabet-pages.

    .venv/Scripts/python.exe scripts/converge-alphabet-pages.py [--lang en] [--rounds 5] [--skip L596,L603]

The generator rejects about one first draft in five, and a rejected page keeps its old text. Each round
re-checks every page, regenerates only the failing (language, entry) pairs one language at a time (three
languages in one call sometimes come back with pages missing), and stops when nothing fails.
"""
import argparse, importlib.util, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("c", ROOT / "scripts" / "check-alphabet-pages.py")
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)

LOCS = ["es", "it", "fr", "de", "ru", "hu", "pt", "ro", "en"]
ap = argparse.ArgumentParser()
ap.add_argument("--lang", default="en")
ap.add_argument("--rounds", type=int, default=5)
ap.add_argument("--skip", default="", help="entry codes to leave alone, comma-separated")
args = ap.parse_args()
SKIP = {code for code in args.skip.split(",") if code}

for round_no in range(1, args.rounds + 1):
    stale = {loc: sorted(set(codes) - SKIP) for loc, codes in c.stale_codes(args.lang, LOCS).items()}
    stale = {loc: codes for loc, codes in stale.items() if codes}
    total = sum(len(v) for v in stale.values())
    print(f"round {round_no}: {total} failing page set(s) {({k: len(v) for k, v in stale.items()})}", flush=True)
    if not total:
        break
    for loc, codes in stale.items():
        subprocess.run(
            [str(ROOT / ".venv/Scripts/python.exe"), "scripts/generate-alphabet-content.py", "--lang", args.lang,
             "--code", ",".join(codes), "--locales", loc, "--overwrite", "--apply"],
            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
print("CONVERGED" if not total else f"STILL FAILING {stale}", flush=True)
