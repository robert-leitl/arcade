import * as Tone from 'tone'
import {Emitter, getDraw} from 'tone';

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

    melodyNoteIntervals = [];
    randomNotesBuffer = [];
    randomWalkIndex = 12;

    isPlaying = false;

    constructor() {
        super();

        const rootNote = this.MELODY_KEY_NOTE;

        const compressor = new Tone.Compressor().toDestination();
        const destination = compressor;

        const crusher = new Tone.BitCrusher(6);
        const cheby = new Tone.Chebyshev(2);
        const dist = new Tone.Distortion(.3);
        const phaser = new Tone.Phaser({
            frequency: 10,
            octaves: 2,
            baseFrequency: 1000
        })
        this.harmonyInstrument = new Tone.PolySynth(
            Tone.AMSynth, {
                volume: -30,
                oscillator: {
                    type: "fatsawtooth",
                    count: 3,
                    spread: 15,
                },
                envelope: {
                    attack: 0.05,
                    decay: 0.,
                    sustain: 0.9,
                    release: 0.8,
                },
                modulation: {
                    type: "square",
                },
            }
        ).chain(dist, destination);
        const chordProgression = [
            ...this.min7ChordIntervals.map(i => [0, this.MIDI_NUM_NAMES[i + rootNote]]),
            ...this.maj7ChordIntervals.map(i => ['1:0:0', this.MIDI_NUM_NAMES[i + rootNote - 2]]),
            ...this.minChordIntervals.map(i => ['2:0:0', this.MIDI_NUM_NAMES[i + rootNote - 5]]),
            ...this.majChordIntervals.map(i => ['3:0:0', this.MIDI_NUM_NAMES[i + rootNote - 7]])
        ];
        // this.harmonyPart = new Tone.Part((time, chord) => {
        //     this.harmonyInstrument.triggerAttackRelease(chord, '0:3:3', time);
        // }, chordProgression ).start('0:0:0');
        // this.harmonyPart.loop = true;
        // this.harmonyPart.loopEnd = '4:0:0';

        const reverb = new Tone.Reverb(30);
        this.sparkInstrument = new Tone.Synth({
            volume: -30,
            oscillator: {
                type: "fatsawtooth",
                count: 3,
                spread: 150,
            },
            envelope: {
                attack: 0.005,
                decay: 0.,
                sustain: 0.001
            }
        });
        this.sparkInstrument.chain(reverb, destination);
        this.sparkPart = new Tone.Part((time, notes) => {
            this.sparkInstrument.triggerAttackRelease(notes, '64n', time);
            Tone.Draw.schedule(() => this.emit('spark'), time);
        }, [['0:1:2', 'D6']] ).start(0);
        this.sparkPart.loop = true;
        this.sparkPart.loopEnd = '0:8:0';




        const filter = new Tone.Filter(200, 'lowpass');
        this.subInstrument = new Tone.Synth({
            volume: -5,
            envelope: {
                attack: 0.005,
                decay: 0.,
                sustain: 1
            },
            octaves: 10
        });
        this.subInstrument.chain(filter, destination);
        this.subPart = new Tone.Part((time, notes) => {
            this.subInstrument.triggerAttackRelease(notes, '6n', time);
            Tone.Draw.schedule(() => this.emit('sub'), time);
        }, [[0, 'D0']] ).start(0);
        this.subPart.loop = true;
        this.subPart.loopEnd = '0:2:0';

        Tone.Transport.bpm.value = 60;
        Tone.Transport.stop();


        this.audioToggleBtn = document.getElementById('audio-toggle');
        this.audioToggleBtn.addEventListener('click', () => {
            if (this.isPlaying) this.stop();
            else this.start();

            this.isPlaying = !this.isPlaying;
        })
    }

    start() {
        setTimeout(() => Tone.Transport.start(), 500);
    }

    stop() {
        Tone.Transport.stop();
    }

}