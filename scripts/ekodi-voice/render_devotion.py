"""Generate OFFLINE draft devotional audio from two independently consented Korean speaker samples.
This does not approve, publish, or expose audio. Run review + publish helper separately.
Requires MeloTTS, OpenVoice V2 and checkpoints from existing EKODI audiobook workflow.
"""
import argparse, json, os, pathlib, subprocess, sys, tempfile
sys.path.insert(0,os.path.dirname(__file__))
from render import Engine, enhance_sample

def run(*args):
    subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

def produce(script_file, samples, checkpoints, output, speed):
    payload=json.load(open(script_file,encoding="utf-8"))
    segments=payload.get("segments")
    if not isinstance(segments,list) or not segments or any(not isinstance(x,str) or len(x)>230 for x in segments):
        raise ValueError("invalid published devotional script")
    out=pathlib.Path(output);out.mkdir(parents=True,exist_ok=True)
    for gender in ("male","female"):
        sample=samples[gender]
        if not os.path.isfile(sample): raise FileNotFoundError(gender+" voice sample missing")
        with tempfile.TemporaryDirectory(prefix="ekodi-voice-") as work:
            reference=os.path.join(work,"reference.wav")
            enhance_sample(sample,reference)
            engine=Engine("ko",checkpoints,reference,speed)
            clips=[]
            for i,chunk in enumerate(segments):
                fn=os.path.join(work,f"c{i:03d}.wav")
                engine.say(chunk,fn)
                clips.append(fn)
                if i<len(segments)-1:
                    pause=os.path.join(work,f"sil{i:03d}.wav")
                    run("ffmpeg","-y","-f","lavfi","-i","anullsrc=r=22050:cl=mono",
                        "-t","0.55" if chunk.endswith("기도.") else "0.22",pause)
                    clips.append(pause)
            concat=os.path.join(work,"concat.txt")
            with open(concat,"w",encoding="utf-8") as file:
                for fn in clips:file.write("file '"+fn.replace("'","'\\''")+"'\n")
            filename=out/(gender+".mp3")
            run("ffmpeg","-y","-f","concat","-safe","0","-i",concat,
                "-ac","1","-ar","44100","-af","loudnorm=I=-18:TP=-3:LRA=7",
                "-c:a","libmp3lame","-b:a","128k",
                "-metadata","artist=EKODI Voice (draft; human review required)",
                str(filename))
        print(gender,filename,"DRAFT — NOT APPROVED OR PUBLISHED",flush=True)

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--script",required=True)
    parser.add_argument("--male-sample",required=True)
    parser.add_argument("--female-sample",required=True)
    parser.add_argument("--checkpoints",default="checkpoints_v2")
    parser.add_argument("--out",required=True)
    parser.add_argument("--speed",type=float,default=0.94)
    args=parser.parse_args()
    if not .75<=args.speed<=1.1:parser.error("invalid speed")
    if os.path.abspath(args.male_sample)==os.path.abspath(args.female_sample):
        parser.error("male and female require distinct consented source recordings")
    produce(args.script,{"male":args.male_sample,"female":args.female_sample},args.checkpoints,args.out,args.speed)
