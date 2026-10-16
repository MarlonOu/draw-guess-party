# 首頁背景音樂合成腳本。執行：python3 docs/music-synth.py && ffmpeg -y -i loop.wav -af "lowpass=f=7500,loudnorm=I=-18:TP=-2:LRA=7" -c:a libmp3lame -b:a 112k public/audio/party-loop.mp3
import numpy as np, subprocess, wave
SR=44100; BPM=104; E=60/BPM/2          # 八分音符長度
BARS=16; SLOTS=8
N=int(BARS*SLOTS*E*SR)
TAIL=int(2.2*SR)
L=np.zeros(N+TAIL); R=np.zeros(N+TAIL)
rng=np.random.default_rng(7)

NOTE={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
def hz(n):                     # 'E5' -> Hz
    o=int(n[-1]); name=n[:-1]; semi=NOTE[name[0]]+(1 if '#' in name else 0)
    return 440*2**((semi+12*(o+1)-69)/12)

def add(sig,start,pan=0.0,gain=1.0):
    i=int(start*SR); 
    if i>=len(L): return
    seg=sig[:len(L)-i]
    gl=gain*np.cos((pan+1)*np.pi/4); gr=gain*np.sin((pan+1)*np.pi/4)
    L[i:i+len(seg)]+=seg*gl; R[i:i+len(seg)]+=seg*gr

def marimba(f,dur=0.9,vel=1.0):
    t=np.arange(int(dur*SR))/SR
    s=(np.sin(2*np.pi*f*t)*np.exp(-t*5.5)
      +0.35*np.sin(2*np.pi*f*4*t)*np.exp(-t*22)
      +0.12*np.sin(2*np.pi*f*10*t)*np.exp(-t*45))
    a=np.minimum(t/0.003,1); return s*a*vel
def pluck(f,dur=0.55,vel=1.0):          # 撥弦低音
    t=np.arange(int(dur*SR))/SR
    s=np.sin(2*np.pi*f*t)*np.exp(-t*6)+0.25*np.sin(2*np.pi*2*f*t)*np.exp(-t*12)
    return s*np.minimum(t/0.004,1)*vel
def kick(vel=1.0):
    t=np.arange(int(0.22*SR))/SR
    f=45+90*np.exp(-t*40); ph=2*np.pi*np.cumsum(f)/SR
    return np.sin(ph)*np.exp(-t*16)*vel
def wood(vel=1.0):                      # 木魚
    t=np.arange(int(0.09*SR))/SR
    return (np.sin(2*np.pi*880*t)+0.4*np.sin(2*np.pi*1320*t))*np.exp(-t*60)*vel
def shaker(vel=1.0):
    t=np.arange(int(0.07*SR))/SR
    n=rng.standard_normal(len(t)); n=np.diff(n,prepend=0)   # 高通
    return n*np.exp(-t*70)*vel
def clap(vel=1.0):
    t=np.arange(int(0.12*SR))/SR
    n=rng.standard_normal(len(t)); n=np.diff(n,prepend=0)
    return n*np.exp(-t*38)*vel

CH={'C':('C3','G3',['C4','E4','G4']),'Am':('A2','E3',['A3','C4','E4']),'F':('F2','C3',['F3','A3','C4']),
    'G':('G2','D3',['G3','B3','D4']),'Dm':('D3','A3',['D4','F4','A4']),'Em':('E3','B3',['E4','G4','B4'])}
PROG=['C','Am','F','G','C','Am','Dm','G','F','G','Em','Am','F','G','C','G']
MEL=[
 "E5 . G5 E5 . C5 D5 E5","A5 . G5 . E5 . C5 .","A5 . C6 A5 . G5 F5 .","G5 . E5 D5 . . . .",
 "E5 . G5 E5 . C5 D5 E5","A5 . C6 . E6 . D6 C6","D6 . C6 A5 . F5 . A5","B5 . G5 . D5 . . .",
 "C6 . A5 . F5 . A5 C6","D6 . B5 . G5 . B5 D6","E6 . D6 B5 . G5 . B5","C6 . E6 . A5 . . .",
 "A5 C6 . A5 F5 . C5 .","B5 D6 . B5 G5 . D5 .","E5 G5 C6 . E6 . D6 C6","D6 . B5 . G5 . . .",
]
for bar in range(BARS):
    root,fifth,tri=CH[PROG[bar]]; b0=bar*SLOTS*E
    sec_b = bar>=8
    for s in range(SLOTS):
        t=b0+s*E+(0.018 if s%2 else 0)            # 輕微搖擺
        # 打擊樂
        if s in (0,4): add(kick(0.55),t,0,0.9)
        if s in (2,6): add(clap(0.10),t,0.15); add(wood(0.30),t,-0.2)
        add(shaker(0.028 if s%2==0 else 0.05),t,0.3 if s%2 else -0.3)
        # 低音
        if s==0: add(pluck(hz(root),0.7,0.6),t,0,0.8)
        if s==3 and bar%2==1: add(pluck(hz(root),0.4,0.4),t,0,0.7)
        if s==4: add(pluck(hz(fifth),0.5,0.45),t,0,0.7)
        if s==6: add(pluck(hz(root)*2,0.35,0.3),t,0,0.6)
        # 和弦刷奏（反拍）
        if s%2==1:
            for k,n in enumerate(tri):
                add(marimba(hz(n),0.45,0.10),t+k*0.006,-0.45+0.45*k,1.0)
        # 旋律
        m=MEL[bar].split()[s]
        if m!='.':
            vel=0.55 if not sec_b else 0.5
            add(marimba(hz(m),1.0,vel),t,0.1,1.0)
            if sec_b: add(marimba(hz(m)*2,0.5,0.12),t,-0.2,1.0)   # B 段加高八度閃亮感
    # 每四小節在最後一拍前放一個「猜猜看」上行裝飾
    if bar%4==3:
        for k,n in enumerate(['E6','G6','A6']):
            add(marimba(hz(n),0.5,0.18),b0+(7*E)+k*E*0.33,0.4,1.0)

# 簡易殘響：衰減雜訊脈衝響應，經 FFT 卷積
def reverb(x,mix=0.22):
    n=int(1.6*SR); ir=rng.standard_normal(n)*np.exp(-np.arange(n)/SR*3.2); ir[:int(0.012*SR)]=0
    ir/=np.sqrt((ir**2).sum())
    return x*(1-mix)+np.convolve(x,ir,mode='full')[:len(x)]*mix*3.0
L=reverb(L); R=reverb(R)
# 尾巴捲回開頭 → 無縫循環
for ch in (L,R):
    ch[:TAIL]+=ch[N:N+TAIL]
L=L[:N]; R=R[:N]
st=np.stack([L,R],1)
peak=np.abs(st).max(); st=st/peak*0.72
# 起訖微淡（避免 mp3 編碼 padding 的爆音；循環接縫靠尾巴疊加）
fade=int(0.004*SR); st[:fade]*=np.linspace(0,1,fade)[:,None]; st[-fade:]*=np.linspace(1,0,fade)[:,None]
pcm=(st*32767).astype(np.int16)
with wave.open('loop.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('dur',N/SR,'peak',peak, 'rms',float(np.sqrt((st**2).mean())))
