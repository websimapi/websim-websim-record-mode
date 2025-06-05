class WebsimRecordMode {
    constructor() {
        this.room = null;
        this.mediaRecorder = null;
        this.audioStream = null;
        this.recordedChunks = [];
        this.audioSegments = [];
        this.isRecording = false;
        this.isHost = false;
        this.currentTranscript = '';
        this.currentRoomId = null;
        
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
        
        // Rooms list
        this.roomsList = document.getElementById('roomsList');
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
                this.updateRoomsList();
            });
            
            // Subscribe to room state changes
            this.room.subscribeRoomState((roomState) => {
                this.updateRoomsList();
                if (roomState.activeRooms && roomState.activeRooms[this.currentRoomId]) {
                    this.updateParticipantsList();
                }
            });

            // Handle custom events
            this.room.onmessage = (event) => {
                this.handleRoomEvent(event.data);
            };
            
            this.updateParticipantsCount();
            this.updateRoomsList();
            
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
        if (!this.isInMeeting() || !this.currentRoomId) return;
        
        const activeRooms = this.room.roomState.activeRooms || {};
        const currentRoom = activeRooms[this.currentRoomId];
        
        if (!currentRoom) return;
        
        this.participantsList.innerHTML = '';
        Object.values(currentRoom.participants || {}).forEach(participant => {
            const participantDiv = document.createElement('div');
            participantDiv.className = 'participant-item';
            participantDiv.innerHTML = `
                <div class="participant-avatar" style="background-image: url(${participant.avatarUrl})"></div>
                <span class="participant-name">${participant.username}</span>
            `;
            this.participantsList.appendChild(participantDiv);
        });
    }

    updateRoomsList() {
        const roomsList = document.getElementById('roomsList');
        const activeRooms = this.room.roomState.activeRooms || {};
        
        if (Object.keys(activeRooms).length === 0) {
            roomsList.innerHTML = '<p class="no-rooms-text">No active rooms available</p>';
            return;
        }
        
        roomsList.innerHTML = '';
        Object.entries(activeRooms).forEach(([roomId, roomData]) => {
            const participantCount = Object.keys(roomData.participants || {}).length;
            const roomDiv = document.createElement('div');
            roomDiv.className = 'room-item';
            roomDiv.innerHTML = `
                <div class="room-info">
                    <div class="room-name">${roomData.name || `Room ${roomId.slice(0, 8)}`}</div>
                    <div class="room-details">${participantCount} participant${participantCount !== 1 ? 's' : ''} • Host: ${roomData.hostName}</div>
                </div>
                <button class="join-room-btn" onclick="app.joinSpecificRoom('${roomId}')">Join</button>
            `;
            roomsList.appendChild(roomDiv);
        });
    }

    async hostMeeting() {
        const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const currentUser = this.room.peers[this.room.clientId];
        
        this.isHost = true;
        this.currentRoomId = roomId;
        
        // Create new room in active rooms
        const activeRooms = this.room.roomState.activeRooms || {};
        activeRooms[roomId] = {
            name: `${currentUser.username}'s Meeting`,
            host: this.room.clientId,
            hostName: currentUser.username,
            participants: {
                [this.room.clientId]: {
                    username: currentUser.username,
                    avatarUrl: currentUser.avatarUrl,
                    joinedAt: Date.now()
                }
            },
            transcript: '',
            startTime: Date.now()
        };
        
        this.room.updateRoomState({ activeRooms });
        
        // Update user presence to show they're in this room
        this.room.updatePresence({
            currentRoom: roomId,
            inMeeting: true
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
                    sampleRate: 16000 // Lower sample rate for better streaming
                } 
            });
            
            // Use a widely supported format
            const mimeType = 'audio/webm;codecs=opus';
            
            // Set up MediaRecorder for complete segments instead of streaming chunks
            this.mediaRecorder = new MediaRecorder(this.audioStream, {
                mimeType: mimeType
            });
            
            this.recordedChunks = [];
            this.audioSegments = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                    // Send complete audio segment
                    this.sendCompleteAudioSegment(event.data);
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
            
            // Start recording with 2-second segments for better streaming
            this.mediaRecorder.start(2000);
            this.isRecording = true;
            
            // Update UI
            this.recordBtn.innerHTML = '<span class="btn-icon">⏹️</span> Stop Transmission';
            this.recordBtn.classList.add('danger');
            this.recordingStatus.classList.add('recording');
            this.recordingText.textContent = 'Transmitting audio...';
            
            // Clear previous transcription
            this.transcriptionContent.innerHTML = '<p class="placeholder-text">Start speaking...</p>';
            this.currentTranscript = '';
            
            // Initialize audio context for playback
            this.initializeAudioPlayback();
            
        } catch (error) {
            console.error('Error starting recording:', error);
            alert('Failed to access microphone. Please check your permissions.');
        }
    }

    async sendCompleteAudioSegment(audioBlob) {
        try {
            // Convert complete audio segment to base64
            const arrayBuffer = await audioBlob.arrayBuffer();
            const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            
            // Send complete audio segment
            this.room.send({
                type: 'audioSegment',
                audioData: base64Audio,
                mimeType: 'audio/webm;codecs=opus',
                timestamp: Date.now(),
                echo: false
            });
        } catch (error) {
            console.error('Error sending audio segment:', error);
        }
    }

    async playReceivedAudio(audioBase64, fromClientId, mimeType = 'audio/webm;codecs=opus') {
        try {
            // Convert base64 to blob
            const binaryString = atob(audioBase64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const audioBlob = new Blob([bytes], { type: mimeType });
            const audioUrl = URL.createObjectURL(audioBlob);
            
            // Create and play audio element
            const audio = new Audio();
            audio.src = audioUrl;
            audio.volume = 0.7;
            
            // Play audio
            await audio.play();
            
            // Clean up
            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
            };
            
        } catch (error) {
            console.error('Error playing received audio:', error);
        }
    }

    initializeAudioPlayback() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Create audio elements for each participant
        this.participantAudioElements = {};
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
            this.recordBtn.innerHTML = '<span class="btn-icon">🎙️</span> Start Transmission';
            this.recordBtn.classList.remove('danger');
            this.recordingStatus.classList.remove('recording');
            this.recordingText.textContent = 'Transmission complete';
            
            // Notify other participants that transmission stopped
            this.room.send({
                type: 'transmissionStopped',
                echo: false
            });
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
        
        // Remove room from active rooms if host
        if (this.isHost && this.currentRoomId) {
            const activeRooms = this.room.roomState.activeRooms || {};
            delete activeRooms[this.currentRoomId];
            this.room.updateRoomState({ activeRooms });
        } else if (this.currentRoomId) {
            // Remove participant from room
            const activeRooms = this.room.roomState.activeRooms || {};
            if (activeRooms[this.currentRoomId] && activeRooms[this.currentRoomId].participants) {
                delete activeRooms[this.currentRoomId].participants[this.room.clientId];
                this.room.updateRoomState({ activeRooms });
            }
        }
        
        // Update user presence
        this.room.updatePresence({
            currentRoom: null,
            inMeeting: false
        });
        
        this.currentRoomId = null;
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
        this.currentRoomId = null;
        
        // Update user presence
        this.room.updatePresence({
            currentRoom: null,
            inMeeting: false
        });
        
        this.analysisResults.classList.add('hidden');
        this.meetingSetup.classList.remove('hidden');
    }

    joinSpecificRoom(roomId) {
        const currentUser = this.room.peers[this.room.clientId];
        const activeRooms = this.room.roomState.activeRooms || {};
        
        if (!activeRooms[roomId]) {
            alert('This room is no longer available');
            return;
        }
        
        this.currentRoomId = roomId;
        this.isHost = false;
        
        // Add user to room participants
        activeRooms[roomId].participants[this.room.clientId] = {
            username: currentUser.username,
            avatarUrl: currentUser.avatarUrl,
            joinedAt: Date.now()
        };
        
        this.room.updateRoomState({ activeRooms });
        
        // Update user presence
        this.room.updatePresence({
            currentRoom: roomId,
            inMeeting: true
        });
        
        this.showMeetingView();
    }

    handleRoomEvent(data) {
        switch (data.type) {
            case 'connected':
                console.log(`${data.username} joined the meeting`);
                break;
            case 'disconnected':
                console.log(`${data.username} left the meeting`);
                break;
            case 'audioSegment':
                // Play received audio segment
                this.playReceivedAudio(data.audioData, data.clientId, data.mimeType);
                break;
            case 'transmissionStopped':
                console.log(`${data.username} stopped transmission`);
                break;
            default:
                console.log('Received event:', data);
        }
    }

    handleSpeechResult(event) {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        // Update the transcription content
        if (this.transcriptionContent.querySelector('.placeholder-text')) {
            this.transcriptionContent.innerHTML = ''; // Clear placeholder
        }
        
        // Remove previous interim line if exists
        const existingInterim = this.transcriptionContent.querySelector('.interim-text');
        if (existingInterim) {
            existingInterim.remove();
        }

        if (finalTranscript) {
            const finalLine = document.createElement('div');
            finalLine.className = 'transcription-line';
            
            const speakerName = document.createElement('div');
            speakerName.className = 'speaker-name';
            speakerName.textContent = this.room.peers[this.room.clientId].username + ':'; // Or a generic "Speaker"
            
            const finalContent = document.createElement('div');
            finalContent.className = 'final-text';
            finalContent.textContent = finalTranscript;
            
            finalLine.appendChild(speakerName);
            finalLine.appendChild(finalContent);
            this.transcriptionContent.appendChild(finalLine);
            
            this.currentTranscript += `${this.room.peers[this.room.clientId].username}: ${finalTranscript}\n`;
        }

        if (interimTranscript) {
            const interimLine = document.createElement('div');
            interimLine.className = 'transcription-line';

            const speakerName = document.createElement('div');
            speakerName.className = 'speaker-name';
            speakerName.textContent = this.room.peers[this.room.clientId].username + ':'; // Or a generic "Speaker"

            const interimContent = document.createElement('div');
            interimContent.className = 'interim-text';
            interimContent.textContent = interimTranscript;
            
            interimLine.appendChild(speakerName);
            interimLine.appendChild(interimContent);
            this.transcriptionContent.appendChild(interimLine);
        }
        
        this.transcriptionContent.scrollTop = this.transcriptionContent.scrollHeight;
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.app = new WebsimRecordMode();
});