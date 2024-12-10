import * as Tone from 'tone'
import {Context, Emitter, getDraw, setContext, Transport} from 'tone';


export class Music extends Emitter {

    MAJOR_SCALE = [0,2,4,5,7,9,11,12];
    NATURAL_MINOR_SCALE = [0,2,3,5,7,8,10,12];
    MIDI_NUM_NAMES = [
                        "C_1", "C#_1", "D_1", "D#_1", "E_1", "F_1", "F#_1", "G_1", "G#_1", "A_1", "A#_1", "B_1",
                        "C0", "C#0", "D0", "D#0", "E0", "F0", "F#0", "G0", "G#0", "A0", "A#0", "B0",
                        "C1", "C#1", "D1", "D#1", "E1", "F1", "F#1", "G1", "G#1", "A1", "A#1", "B1",
                        "C2", "C#2", "D2", "D#2", "E2", "F2", "F#2", "G2", "G#2", "A2", "A#2", "B2",
                        "C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3",
                        "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4",
                        "C5", "C#5", "D5", "D#5", "E5", "F5", "F#5", "G5", "G#5", "A5", "A#5", "B5",
                        "C6", "C#6", "D6", "D#6", "E6", "F6", "F#6", "G6", "G#6", "A6", "A#6", "B6",
                        "C7", "C#7", "D7", "D#7", "E7", "F7", "F#7", "G7", "G#7", "A7", "A#7", "B7",
                        "C8", "C#8", "D8", "D#8", "E8", "F8", "F#8", "G8", "G#8", "A8", "A#8", "B8",
                        "C9", "C#9", "D9", "D#9", "E9", "F9", "F#9", "G9"
    ];
    MELODY_KEY_NOTE = 59; // middle B

    majChordIntervals = [0, 4, 7];
    minChordIntervals = [0, 3, 7];
    maj7ChordIntervals = [0, 4, 7, 11];
    min7ChordIntervals = [0, 3, 7, 10];

    c00 = ['G4', 'B2', 'E3'];
    c01 = ['E4', 'B2', 'E3'];
    c02 = ['G#3', 'D#3', 'A4'];

    c10 = ['G3', 'B4', 'E3'];
    c11 = ['C3', 'G2', 'C4'];
    c12 = ['A#4', 'F3', 'C4'];

    c20 = ['C3', 'G2', 'C4'];
    c21 = ['F3', 'C3', 'F2'];
    c22 = ['G#3', 'D#3', 'G4'];

    arp0 = ['C7', 'B6', 'G#6', 'G6']

    melodyNoteIntervals = [];
    randomNotesBuffer = [];
    randomWalkIndex = 12;

    isInitialized = false;
    isPlaying = false;

    constructor() {
        super();

        this.audioToggleBtn = document.getElementById('audio-toggle');
        this.audioToggleBtn.classList = [ 'stopped' ]
        this.audioToggleBtn.addEventListener('click', async () => {
            if (!this.isInitialized) {
                await Tone.start();
                await this.init();
                this.isInitialized = true;
            }

            if (this.isPlaying){
                this.stop();
            } else {
                this.start();
            }

            this.isPlaying = !this.isPlaying;

            this.audioToggleBtn.classList = [ this.isPlaying ? 'playing' : 'stopped' ];

            this.emit('state');
        })
    }

    async init() {
        Tone.getContext().lookAhead = 0.01;

        const rootNote = this.MELODY_KEY_NOTE;

        const compressor = new Tone.Compressor().toDestination();
        const destination = compressor;

        const harmonyDist = new Tone.Distortion({ distortion: 0.4, wet: .5 });
        const harmonyVolume = new Tone.Volume(-27);
        const phaser = new Tone.Phaser({
            frequency: 10,
            octaves: 2,
            baseFrequency: 1000
        })
        this.harmonyInstrument = new Tone.PolySynth(
            Tone.AMSynth, {
                oscillator: {
                    type: "fatsawtooth",
                    count: 3,
                    spread: 15,
                },
                envelope: {
                    attack: .1,
                    decay: 0.,
                    sustain: 1,
                    release: 1,
                },
                modulation: {
                    type: "square",
                },
            }
        ).chain(harmonyDist, harmonyVolume, destination);
        const chordProgression = [
            ...this.c00.map(n => ['0:0:0', n]),
            ...this.c01.map(n => ['1:0:0', n]),
            ...this.c02.map(n => ['2:0:0', n]),

            ...this.c10.map(n => ['3:0:0', n]),
            ...this.c11.map(n => ['4:0:0', n]),
            ...this.c12.map(n => ['5:0:0', n]),

            ...this.c00.map(n => ['6:0:0', n]),
            ...this.c01.map(n => ['7:0:0', n]),
            ...this.c02.map(n => ['8:0:0', n]),

            ...this.c20.map(n => ['9:0:0', n]),
            ...this.c21.map(n => ['10:0:0', n]),
            ...this.c22.map(n => ['11:0:0', n]),
        ];
        this.harmonyPart = new Tone.Part((time, chord) => {
            this.harmonyInstrument.triggerAttackRelease(chord, '1n', time);
        }, chordProgression ).start('6:0:0');
        this.harmonyPart.loop = true;
        this.harmonyPart.loopEnd = '12:0:0';


        const meldoyDist = new Tone.Distortion({ distortion: 1, wet: .9 });
        const melodyVolume = new Tone.Volume(-37);
        const melodyReverb = new Tone.Reverb(2);
        this.meldoyInstrument = new Tone.PolySynth(
            Tone.AMSynth, {
                oscillator: {
                    type: "fatsawtooth",
                    count: 4,
                    spread: 180,
                },
                envelope: {
                    attack: .001,
                    decay: 0.,
                    sustain: .01,
                    release: .01,
                },
                modulation: {
                    type: "square",
                },
            }
        ).chain(meldoyDist, melodyVolume, destination);
        this.melodyArpeggio = new Tone.Pattern((time, note) => {
            this.meldoyInstrument.triggerAttackRelease(note, '16n');
        }, this.arp0, 'upDown').start('30:0:0');
        this.melodyArpeggio.iterations = 6*12*4;
        this.melodyArpeggio.interval = '8t';








        const sparkReverb = new Tone.Reverb(10);
        this.sparkInstrument = new Tone.Synth({
            volume: -35,
            oscillator: {
                type: "fatsawtooth",
                count: 3,
                spread: 100,
            },
            envelope: {
                attack: 0.005,
                decay: 0.,
                sustain: 1
            }
        });
        this.sparkInstrument.chain(sparkReverb, destination);
        this.sparkPart = new Tone.Part((time, notes) => {
            this.sparkInstrument.triggerAttackRelease(notes, '64n', time);
            Tone.Draw.schedule(() => this.emit('spark'), time);
        }, [['0:0:0', 'G6']] ).start('6:0:0');
        this.sparkPart.loop = true;
        this.sparkPart.loopEnd = '6:0:0';



        const subReverb = new Tone.Reverb(10);
        const subDist = new Tone.Distortion({ distortion: 0.7, wet: 1 });
        const subLowPass = new Tone.Filter(100, 'lowpass');
        this.subInstrument = new Tone.Synth({
            volume: -5,
            envelope: {
                attack: 0.005,
                decay: 0.,
                sustain: 1
            },
            octaves: 10
        });
        this.subInstrument.chain(subLowPass, subDist, subReverb, destination);
        this.subPart = new Tone.Part((time, notes) => {
            this.subInstrument.triggerAttackRelease(notes, '6n', time);
            Tone.Draw.schedule(() => this.emit('sub'), time);
        }, [[0, 'G0']] ).start('0:0:0');
        this.subPart.loop = true;
        this.subPart.loopEnd = '3:0:0';

        Tone.Transport.bpm.value = 180;
        Tone.Transport.stop();
    }

    start() {
        setTimeout(() => Tone.Transport.start(), 500);
    }

    stop() {
        Tone.Transport.stop();
    }

}