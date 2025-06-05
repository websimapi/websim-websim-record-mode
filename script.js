class WebsimRecordMode {
    constructor() {
        this.room = null;
        this.mediaRecorder = null;
        this.audioStream = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.isHost = false;
        this.currentTranscript = '';
        
        this.initializeElements();
        this.setupEventListeners();
        this.initializeRoom();
    }

    initializeElements() {
        // Main views
        this.meetingSetup = document.getElementById('meetingSetup');
        this.meetingActive = document.getElementById('meetingActive');
        this.analysisResults = document.getElementById('analysisResults');
        
        // User info
        this.userAvatar = document.getElementById('userAvatar');
        this.username = document.getElementById('username');
        
        // Setup elements
        this.hostMeetingBtn = document.getElementById('hostMeetingBtn');
        this.participantsCount = document.getElementById('participantsCount');
        
        // Meeting elements
        this.recordBtn = document.getElementById('recordBtn');
        this.endMeetingBtn = document.getElementById('endMeetingBtn');
        this.recordingStatus = document.getElementById('recordingStatus');
        this.recordingText = document.getElementById('recordingText');
        this.participantsList = document.getElementById('participantsList');
        this.transcriptionContent = document.getElementById('transcriptionContent');
        
        // Results elements
        this.newMeetingBtn = document.getElementById('newMeetingBtn');
        this.keyPoints = document.getElementById('keyPoints');
        this.actionItems = document.getElementById('actionItems');
        this.generatedCode = document.getElementById('generatedCode');
        this.fullTranscript = document.getElementById('fullTranscript');
    }

    setupEventListeners() {
        this.hostMeetingBtn.addEventListener('click', () => this.hostMeeting());
        this.recordBtn.addEventListener('click', () => this.toggleRecording());
        this.endMeetingBtn.addEventListener('click', () => this.endMeeting());
        this.newMeetingBtn.addEventListener('click', () => this.startNewMeeting());
    }

    async initializeRoom() {
        try {
            this.room = new WebsimSocket();
            await this.room.initialize();
            
            // Set up user info
            const currentUser = this.room.peers[this.room.clientId];
            this.username.textContent = currentUser.username;
            this.userAvatar.style.backgroundImage = `url(${currentUser.avatarUrl})`;
            
            // Subscribe to presence changes
            this.room.subscribePresence((presence) => {
                this.updateParticipantsCount();
                this.updateParticipantsList();
            });
            
            // Subscribe to room state changes
            this.room.subscribeRoomState((roomState) => {
                if (roomState.meetingActive && !this.isInMeeting()) {
                    this.joinMeeting();
                } else if (!roomState.meetingActive && this.isInMeeting()) {
                    this.leaveMeeting();
                }
            });

            // Handle custom events
            this.room.onmessage = (event) => {
                this.handleRoomEvent(event.data);
            };
            
            this.updateParticipantsCount();
            
            // Check if there's already an active meeting
            if (this.room.roomState.meetingActive) {
                this.joinMeeting();
            }
            
        } catch (error) {
            console.error('Failed to initialize room:', error);
        }
    }

    updateParticipantsCount() {
        const count = Object.keys(this.room.peers).length;
        this.participantsCount.textContent = `${count} participant${count !== 1 ? 's' : ''} online`;
    }

    updateParticipantsList() {
        if (!this.isInMeeting()) return;
        
        this.participantsList.innerHTML = '';
        Object.values(this.room.peers).forEach(peer => {
            const participantDiv = document.createElement('div');
            participantDiv.className = 'participant-item';
            participantDiv.innerHTML = `
                <div class="participant-avatar" style="background-image: url(${peer.avatarUrl})"></div>
                <span class="participant-name">${peer.username}</span>
            `;
            this.participantsList.appendChild(participantDiv);
        });
    }

    async hostMeeting() {
        this.isHost = true;
        
        // Start the meeting in room state
        this.room.updateRoomState({
            meetingActive: true,
            host: this.room.clientId,
            transcript: '',
            startTime: Date.now()
        });
        
        this.showMeetingView();
    }

    joinMeeting() {
        this.showMeetingView();
    }

    showMeetingView() {
        this.meetingSetup.classList.add('hidden');
        this.meetingActive.classList.remove('hidden');
        this.analysisResults.classList.add('hidden');
        
        this.updateParticipantsList();
    }

    leaveMeeting() {
        this.meetingActive.classList.add('hidden');
        this.meetingSetup.classList.remove('hidden');
        this.analysisResults.classList.add('hidden');
        
        if (this.isRecording) {
            this.stopRecording();
        }
    }

    isInMeeting() {
        return !this.meetingActive.classList.contains('hidden');
    }

    async toggleRecording() {
        if (this.isRecording) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            // Request microphone access
            this.audioStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                } 
            });
            
            // Set up MediaRecorder for audio storage
            this.mediaRecorder = new MediaRecorder(this.audioStream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.recordedChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };
            
            // Set up Speech Recognition for live transcription
            if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                this.recognition = new SpeechRecognition();
                this.recognition.continuous = true;
                this.recognition.interimResults = true;
                this.recognition.lang = 'en-US';
                
                this.recognition.onresult = (event) => {
                    this.handleSpeechResult(event);
                };
                
                this.recognition.onerror = (event) => {
                    console.error('Speech recognition error:', event.error);
                };
                
                this.recognition.start();
            }
            
            // Start recording
            this.mediaRecorder.start(1000);
            this.isRecording = true;
            
            // Update UI
            this.recordBtn.innerHTML = '<span class="btn-icon">⏹️</span> Stop Recording';
            this.recordBtn.classList.add('danger');
            this.recordingStatus.classList.add('recording');
            this.recordingText.textContent = 'Recording in progress...';
            
            // Clear previous transcription
            this.transcriptionContent.innerHTML = '<p class="placeholder-text">Start speaking...</p>';
            this.currentTranscript = '';
            
        } catch (error) {
            console.error('Error starting recording:', error);
            alert('Failed to access microphone. Please check your permissions.');
        }
    }

    handleSpeechResult(event) {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }
        
        // Update current transcript with final results
        if (finalTranscript) {
            this.currentTranscript += finalTranscript;
            this.updateLiveTranscription(this.currentTranscript, interimTranscript);
            
            // Update room state with transcript
            this.room.updateRoomState({
                transcript: this.currentTranscript
            });
        } else if (interimTranscript) {
            this.updateLiveTranscription(this.currentTranscript, interimTranscript);
        }
    }

    updateLiveTranscription(finalText, interimText) {
        const currentUser = this.room.peers[this.room.clientId];
        
        this.transcriptionContent.innerHTML = `
            <div class="transcription-line">
                <div class="speaker-name">${currentUser.username}</div>
                <div class="final-text">${finalText}</div>
                <div class="interim-text">${interimText}</div>
            </div>
        `;
        
        // Scroll to bottom
        this.transcriptionContent.scrollTop = this.transcriptionContent.scrollHeight;
    }

    async stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            
            // Stop speech recognition
            if (this.recognition) {
                this.recognition.stop();
            }
            
            this.audioStream.getTracks().forEach(track => track.stop());
            
            this.isRecording = false;
            
            // Update UI
            this.recordBtn.innerHTML = '<span class="btn-icon">🎙️</span> Start Recording';
            this.recordBtn.classList.remove('danger');
            this.recordingStatus.classList.remove('recording');
            this.recordingText.textContent = 'Recording complete';
        }
    }

    async endMeeting() {
        if (this.isRecording) {
            await this.stopRecording();
        }
        
        // Process the final transcript with AI
        if (this.currentTranscript) {
            await this.analyzeTranscript();
        }
        
        // End meeting in room state
        this.room.updateRoomState({
            meetingActive: false,
            host: null,
            endTime: Date.now()
        });
        
        this.showAnalysisResults();
    }

    async analyzeTranscript() {
        try {
            // Extract key points
            const keyPointsCompletion = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "Extract 3-5 key points from this meeting transcript. Return as JSON array of strings."
                    },
                    {
                        role: "user",
                        content: this.currentTranscript
                    }
                ],
                json: true
            });
            
            // Generate action items
            const actionItemsCompletion = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "Generate 3-5 actionable items based on this meeting transcript. Return as JSON array of strings."
                    },
                    {
                        role: "user",
                        content: this.currentTranscript
                    }
                ],
                json: true
            });
            
            // Generate code if relevant
            const codeCompletion = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "If this meeting transcript mentions any technical implementation, generate relevant code. Otherwise, return 'No code generated'. Return plain text."
                    },
                    {
                        role: "user",
                        content: this.currentTranscript
                    }
                ]
            });
            
            // Parse results
            const keyPoints = JSON.parse(keyPointsCompletion.content);
            const actionItems = JSON.parse(actionItemsCompletion.content);
            const generatedCode = codeCompletion.content;
            
            // Store results
            this.analysisData = {
                keyPoints,
                actionItems,
                generatedCode,
                fullTranscript: this.currentTranscript
            };
            
        } catch (error) {
            console.error('Error analyzing transcript:', error);
            // Fallback data
            this.analysisData = {
                keyPoints: ['Meeting completed successfully'],
                actionItems: ['Review meeting recording'],
                generatedCode: 'No code generated',
                fullTranscript: this.currentTranscript || 'No transcript available'
            };
        }
    }

    showAnalysisResults() {
        this.meetingActive.classList.add('hidden');
        this.analysisResults.classList.remove('hidden');
        
        if (this.analysisData) {
            // Populate key points
            this.keyPoints.innerHTML = this.analysisData.keyPoints
                .map(point => `<div class="key-point">${point}</div>`)
                .join('');
            
            // Populate action items
            this.actionItems.innerHTML = this.analysisData.actionItems
                .map(item => `<div class="action-item">${item}</div>`)
                .join('');
            
            // Populate generated code
            this.generatedCode.textContent = this.analysisData.generatedCode;
            
            // Populate full transcript
            this.fullTranscript.textContent = this.analysisData.fullTranscript;
        }
    }

    startNewMeeting() {
        this.isHost = false;
        this.currentTranscript = '';
        this.analysisData = null;
        
        this.analysisResults.classList.add('hidden');
        this.meetingSetup.classList.remove('hidden');
    }

    handleRoomEvent(data) {
        switch (data.type) {
            case 'connected':
                console.log(`${data.username} joined the meeting`);
                break;
            case 'disconnected':
                console.log(`${data.username} left the meeting`);
                break;
            default:
                console.log('Received event:', data);
        }
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new WebsimRecordMode();
});