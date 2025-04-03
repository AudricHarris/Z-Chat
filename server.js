const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const fs = require('fs');

// Initialisation de l'application Express
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname)));

// Connexion à MongoDB
mongoose.connect('mongodb://localhost:27017/zchat', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000 // Timeout après 5 secondes
}).then(() => {
    console.log('Connecté à MongoDB');
    // Charger les données depuis la base de données
    loadDataFromDB();
}).catch(err => {
    console.error('Erreur de connexion à MongoDB:', err);
    console.log('Utilisation du mode de stockage en mémoire avec sauvegarde JSON');
    // Charger les données depuis le fichier JSON si disponible
    loadDataFromFile();
});

// Définition des schémas et modèles Mongoose
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    profilePic: { type: String, default: 'Image/me.webp' },
    friends: [{ type: String }],
    pendingRequests: [{ type: String }]
});

const messageSchema = new mongoose.Schema({
    conversationId: { type: String, required: true },
    sender: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Number, default: Date.now },
    avatar: { type: String }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// Stockage des utilisateurs connectés
const connectedUsers = {};
// Stockage des conversations (format: {"user1:user2": [messages]})
// Utilisation d'un objet persistant pour les conversations entre les sessions
const conversations = {};
// Stockage des relations d'amitié
const friendships = {};
// Stockage des demandes d'amitié en attente
const pendingFriendRequests = {};

// Fonction pour charger les données depuis MongoDB
async function loadDataFromDB() {
    try {
        // Charger les utilisateurs et leurs relations
        const users = await User.find();
        users.forEach(user => {
            friendships[user.username] = user.friends || [];
            pendingFriendRequests[user.username] = user.pendingRequests || [];
        });
        
        // Charger les messages
        const messages = await Message.find().sort('timestamp');
        messages.forEach(msg => {
            if (!conversations[msg.conversationId]) {
                conversations[msg.conversationId] = [];
            }
            conversations[msg.conversationId].push({
                sender: msg.sender,
                text: msg.text,
                timestamp: msg.timestamp,
                avatar: msg.avatar
            });
        });
        console.log('Données chargées depuis MongoDB');
    } catch (err) {
        console.error('Erreur lors du chargement des données depuis MongoDB:', err);
    }
}

// Fonction pour charger les données depuis un fichier JSON
function loadDataFromFile() {
    try {
        if (fs.existsSync('./chat_data.json')) {
            const data = JSON.parse(fs.readFileSync('./chat_data.json', 'utf8'));
            if (data.conversations) Object.assign(conversations, data.conversations);
            if (data.friendships) Object.assign(friendships, data.friendships);
            if (data.pendingFriendRequests) Object.assign(pendingFriendRequests, data.pendingFriendRequests);
            console.log('Données chargées depuis le fichier JSON');
        }
    } catch (err) {
        console.error('Erreur lors du chargement des données depuis le fichier JSON:', err);
    }
}

// Fonction pour sauvegarder les données
async function saveData() {
    try {
        // Sauvegarder dans MongoDB si connecté
        if (mongoose.connection.readyState === 1) {
            // Sauvegarder les utilisateurs et leurs relations
            for (const username in friendships) {
                await User.findOneAndUpdate(
                    { username },
                    { 
                        username,
                        friends: friendships[username] || [],
                        pendingRequests: pendingFriendRequests[username] || []
                    },
                    { upsert: true, new: true }
                );
            }
            
            // Sauvegarder les messages
            for (const conversationId in conversations) {
                // Supprimer les anciens messages pour éviter les doublons
                await Message.deleteMany({ conversationId });
                
                // Ajouter les nouveaux messages
                for (const msg of conversations[conversationId]) {
                    await new Message({
                        conversationId,
                        sender: msg.sender,
                        text: msg.text,
                        timestamp: msg.timestamp,
                        avatar: msg.avatar
                    }).save();
                }
            }
            console.log('Données sauvegardées dans MongoDB');
        } else {
            // Sauvegarder dans un fichier JSON si MongoDB n'est pas disponible
            const data = {
                conversations,
                friendships,
                pendingFriendRequests
            };
            fs.writeFileSync('./chat_data.json', JSON.stringify(data, null, 2));
            console.log('Données sauvegardées dans le fichier JSON');
        }
    } catch (err) {
        console.error('Erreur lors de la sauvegarde des données:', err);
        // Sauvegarde de secours dans un fichier JSON
        try {
            const data = {
                conversations,
                friendships,
                pendingFriendRequests
            };
            fs.writeFileSync('./chat_data.json', JSON.stringify(data, null, 2));
            console.log('Données sauvegardées dans le fichier JSON (sauvegarde de secours)');
        } catch (backupErr) {
            console.error('Échec de la sauvegarde de secours:', backupErr);
        }
    }
}

// Sauvegarder les données périodiquement (toutes les 5 minutes)
setInterval(saveData, 5 * 60 * 1000);

// Sauvegarder les données avant de fermer le serveur
process.on('SIGINT', async () => {
    console.log('Sauvegarde des données avant fermeture...');
    await saveData();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Sauvegarde des données avant fermeture...');
    await saveData();
    process.exit(0);
});

// Gestion des connexions Socket.IO
io.on('connection', (socket) => {
    console.log('Nouvel utilisateur connecté:', socket.id);
    
    // Enregistrement d'un utilisateur
    socket.on('register', async (userData) => {
        // Vérifier si le nom d'utilisateur existe déjà
        const usernameExists = await checkUsernameExists(userData.username);
        
        if (usernameExists) {
            // Informer l'utilisateur que le nom est déjà pris
            socket.emit('registerResponse', { 
                success: false, 
                message: "Ce nom d'utilisateur est déjà utilisé. Veuillez en choisir un autre."
            });
            return;
        }
        
        console.log('Utilisateur enregistré:', userData.username);
        connectedUsers[socket.id] = {
            id: socket.id,
            username: userData.username,
            profilePic: userData.profilePic
        };
        
        // Initialiser la liste d'amis pour ce nouvel utilisateur s'il n'en a pas
        if (!friendships[userData.username]) {
            friendships[userData.username] = [];
        }
        
        // Initialiser la liste des demandes d'amitié en attente
        if (!pendingFriendRequests[userData.username]) {
            pendingFriendRequests[userData.username] = [];
        }
        
        // Sauvegarder le nouvel utilisateur dans la base de données
        try {
            if (mongoose.connection.readyState === 1) {
                await User.findOneAndUpdate(
                    { username: userData.username },
                    { 
                        username: userData.username,
                        profilePic: userData.profilePic,
                        friends: friendships[userData.username],
                        pendingRequests: pendingFriendRequests[userData.username]
                    },
                    { upsert: true, new: true }
                );
            }
        } catch (err) {
            console.error('Erreur lors de la sauvegarde de l\'utilisateur:', err);
        }
        
        // Informer l'utilisateur que l'enregistrement a réussi
        socket.emit('registerResponse', { success: true });
        
        // Informer tous les utilisateurs de la liste mise à jour
        io.emit('userList', Object.values(connectedUsers));
        
        // Envoyer la liste d'amis à l'utilisateur qui vient de se connecter
        socket.emit('friendList', friendships[userData.username] || []);
        
        // Envoyer la liste des demandes d'amitié en attente
        socket.emit('pendingFriendRequests', pendingFriendRequests[userData.username] || []);
        
        // Envoyer les conversations existantes pour cet utilisateur
        const userConversations = {};
        Object.keys(conversations).forEach(key => {
            // Vérifier si l'utilisateur fait partie de cette conversation
            if (key.includes(userData.username)) {
                // Extraire l'autre utilisateur de la clé
                const users = key.split(':');
                const otherUser = users[0] === userData.username ? users[1] : users[0];
                
                // S'assurer que les messages sont correctement formatés pour le client
                const formattedMessages = conversations[key].map(msg => {
                    // Déterminer si le message a été envoyé par l'utilisateur actuel
                    const isSentByCurrentUser = msg.sender === userData.username;
                    
                    return {
                        sender: isSentByCurrentUser ? 'me' : msg.sender,
                        text: msg.text,
                        timestamp: msg.timestamp,
                        avatar: msg.avatar || (isSentByCurrentUser ? userData.profilePic : 'Image/Friends.webp')
                    };
                });
                
                userConversations[otherUser] = formattedMessages;
            }
        });
        console.log('Envoi des conversations à', userData.username, ':', userConversations);
        socket.emit('loadConversations', userConversations);
        
        
        // Associer le nom d'utilisateur au socket ID pour faciliter le suivi
        socket.username = userData.username;
    });
    
    // Fonction pour vérifier si un nom d'utilisateur existe déjà
    async function checkUsernameExists(username) {
        // Vérifier dans la base de données si connecté
        if (mongoose.connection.readyState === 1) {
            const user = await User.findOne({ username });
            if (user) return true;
        }
        
        // Vérifier dans les utilisateurs connectés
        for (const id in connectedUsers) {
            if (connectedUsers[id].username.toLowerCase() === username.toLowerCase()) {
                return true;
            }
        }
        
        // Vérifier dans les relations d'amitié (utilisateurs qui se sont déjà connectés)
        if (friendships[username]) {
            return true;
        }
        
        return false;
    }
    
    // Envoi d'une demande d'amitié
    socket.on('addFriend', async (data) => {
        const { username, friendUsername } = data;
        
        // Vérifier si l'utilisateur existe
        if (!pendingFriendRequests[friendUsername]) {
            pendingFriendRequests[friendUsername] = [];
        }
        
        // Vérifier si l'ami n'est pas déjà dans la liste des demandes en attente
        if (!pendingFriendRequests[friendUsername].includes(username) && 
            !friendships[username]?.includes(friendUsername)) {
            
            // Vérifier si l'autre utilisateur a déjà envoyé une demande
            if (pendingFriendRequests[username]?.includes(friendUsername)) {
                // Si oui, accepter automatiquement la demande
                if (!friendships[username]) friendships[username] = [];
                if (!friendships[friendUsername]) friendships[friendUsername] = [];
                
                friendships[username].push(friendUsername);
                friendships[friendUsername].push(username);
                
                // Supprimer la demande en attente
                pendingFriendRequests[username] = pendingFriendRequests[username].filter(
                    friend => friend !== friendUsername
                );
                
                socket.emit('friendAdded', { success: true, friendUsername });
                
                // Envoyer les listes mises à jour
                socket.emit('friendList', friendships[username]);
                socket.emit('pendingFriendRequests', pendingFriendRequests[username] || []);
                
                // Notifier l'autre utilisateur
                const recipientId = Object.keys(connectedUsers).find(
                    id => connectedUsers[id].username === friendUsername
                );
                if (recipientId) {
                    io.to(recipientId).emit('friendAdded', { success: true, friendUsername: username });
                    io.to(recipientId).emit('friendList', friendships[friendUsername]);
                }
                
                // Sauvegarder les changements dans la base de données
                try {
                    if (mongoose.connection.readyState === 1) {
                        // Mettre à jour les deux utilisateurs
                        await User.findOneAndUpdate(
                            { username },
                            { friends: friendships[username] },
                            { upsert: true, new: true }
                        );
                        
                        await User.findOneAndUpdate(
                            { username: friendUsername },
                            { friends: friendships[friendUsername] },
                            { upsert: true, new: true }
                        );
                    } else {
                        // Sauvegarde dans le fichier JSON si MongoDB n'est pas disponible
                        saveData();
                    }
                } catch (err) {
                    console.error('Erreur lors de la mise à jour des relations d\'amitié:', err);
                }
            } else {
                // Sinon, ajouter à la liste des demandes en attente
                pendingFriendRequests[friendUsername].push(username);
                
                // Notifier l'utilisateur que la demande a été envoyée
                socket.emit('friendRequestSent', { success: true, friendUsername });
                
                // Notifier l'autre utilisateur de la nouvelle demande
                const recipientId = Object.keys(connectedUsers).find(
                    id => connectedUsers[id].username === friendUsername
                );
                if (recipientId) {
                    io.to(recipientId).emit('newFriendRequest', { from: username });
                    io.to(recipientId).emit('pendingFriendRequests', pendingFriendRequests[friendUsername]);
                }
                
                // Sauvegarder les changements dans la base de données
                try {
                    if (mongoose.connection.readyState === 1) {
                        await User.findOneAndUpdate(
                            { username: friendUsername },
                            { pendingRequests: pendingFriendRequests[friendUsername] },
                            { upsert: true, new: true }
                        );
                    } else {
                        // Sauvegarde dans le fichier JSON si MongoDB n'est pas disponible
                        saveData();
                    }
                } catch (err) {
                    console.error('Erreur lors de la mise à jour des demandes d\'amitié:', err);
                }
            }
        } else {
            // Déjà ami ou demande déjà envoyée
            socket.emit('friendRequestSent', { 
                success: false, 
                friendUsername, 
                message: "Demande déjà envoyée ou déjà ami"
            });
        }
    });
    
    // Accepter une demande d'amitié
    socket.on('acceptFriendRequest', async (data) => {
        const { username, friendUsername } = data;
        
        // Vérifier si la demande existe
        if (pendingFriendRequests[username]?.includes(friendUsername)) {
            // Initialiser les tableaux si nécessaire
            if (!friendships[username]) friendships[username] = [];
            if (!friendships[friendUsername]) friendships[friendUsername] = [];
            
            // Ajouter l'amitié dans les deux sens
            friendships[username].push(friendUsername);
            friendships[friendUsername].push(username);
            
            // Supprimer la demande en attente
            pendingFriendRequests[username] = pendingFriendRequests[username].filter(
                friend => friend !== friendUsername
            );
            
            // Sauvegarder les changements dans la base de données
            try {
                if (mongoose.connection.readyState === 1) {
                    // Mettre à jour les deux utilisateurs
                    await User.findOneAndUpdate(
                        { username },
                        { 
                            friends: friendships[username],
                            pendingRequests: pendingFriendRequests[username]
                        },
                        { new: true }
                    );
                    
                    await User.findOneAndUpdate(
                        { username: friendUsername },
                        { friends: friendships[friendUsername] },
                        { new: true }
                    );
                } else {
                    // Sauvegarde dans le fichier JSON si MongoDB n'est pas disponible
                    saveData();
                }
            } catch (err) {
                console.error('Erreur lors de la mise à jour des relations d\'amitié:', err);
            }
            
            // Notifier l'utilisateur actuel
            socket.emit('friendAdded', { success: true, friendUsername });
            socket.emit('friendList', friendships[username]);
            socket.emit('pendingFriendRequests', pendingFriendRequests[username]);
            
            // Notifier l'autre utilisateur
            const recipientId = Object.keys(connectedUsers).find(
                id => connectedUsers[id].username === friendUsername
            );
            if (recipientId) {
                io.to(recipientId).emit('friendAdded', { success: true, friendUsername: username });
                io.to(recipientId).emit('friendList', friendships[friendUsername]);
            }
        }
    });
    
    // Rejeter une demande d'amitié
    socket.on('rejectFriendRequest', async (data) => {
        const { username, friendUsername } = data;
        
        // Vérifier si la demande existe
        if (pendingFriendRequests[username]?.includes(friendUsername)) {
            // Supprimer la demande en attente
            pendingFriendRequests[username] = pendingFriendRequests[username].filter(
                friend => friend !== friendUsername
            );
            
            // Sauvegarder les changements dans la base de données
            try {
                if (mongoose.connection.readyState === 1) {
                    await User.findOneAndUpdate(
                        { username },
                        { pendingRequests: pendingFriendRequests[username] },
                        { new: true }
                    );
                } else {
                    // Sauvegarde dans le fichier JSON si MongoDB n'est pas disponible
                    saveData();
                }
            } catch (err) {
                console.error('Erreur lors de la mise à jour des demandes d\'amitié:', err);
            }
            
            // Notifier l'utilisateur actuel
            socket.emit('friendRequestRejected', { success: true, friendUsername });
            socket.emit('pendingFriendRequests', pendingFriendRequests[username]);
            
            // Notifier l'autre utilisateur (optionnel)
            const recipientId = Object.keys(connectedUsers).find(
                id => connectedUsers[id].username === friendUsername
            );
            if (recipientId) {
                io.to(recipientId).emit('friendRequestRejected', { 
                    success: true, 
                    friendUsername: username,
                    message: "Votre demande d'amitié a été rejetée"
                });
            }
        }
    });
    
    // Suppression d'un ami
    socket.on('removeFriend', async (data) => {
        const { username, friendUsername } = data;
        
        if (friendships[username]) {
            // Filtrer la liste d'amis pour supprimer l'ami
            friendships[username] = friendships[username].filter(friend => friend !== friendUsername);
            socket.emit('friendRemoved', { success: true, friendUsername });
            
            // Envoyer la liste d'amis mise à jour
            socket.emit('friendList', friendships[username]);
            
            // Supprimer également l'amitié dans l'autre sens
            if (friendships[friendUsername]) {
                friendships[friendUsername] = friendships[friendUsername].filter(
                    friend => friend !== username
                );
                
                // Notifier l'autre utilisateur
                const recipientId = Object.keys(connectedUsers).find(
                    id => connectedUsers[id].username === friendUsername
                );
                if (recipientId) {
                    io.to(recipientId).emit('friendRemoved', { success: true, friendUsername: username });
                    io.to(recipientId).emit('friendList', friendships[friendUsername]);
                }
                
                // Sauvegarder les changements dans la base de données
                try {
                    if (mongoose.connection.readyState === 1) {
                        // Mettre à jour les deux utilisateurs
                        await User.findOneAndUpdate(
                            { username },
                            { friends: friendships[username] },
                            { new: true }
                        );
                        
                        await User.findOneAndUpdate(
                            { username: friendUsername },
                            { friends: friendships[friendUsername] },
                            { new: true }
                        );
                    } else {
                        // Sauvegarde dans le fichier JSON si MongoDB n'est pas disponible
                        saveData();
                    }
                } catch (err) {
                    console.error('Erreur lors de la mise à jour des relations d\'amitié:', err);
                }
            }
        }
    });
    
    // Envoi d'un message
    socket.on('sendMessage', async (messageData) => {
        console.log('Message reçu:', messageData);
        
        // Créer une clé unique pour la conversation entre les deux utilisateurs
        // Toujours trier les noms pour assurer la cohérence
        const users = [messageData.from, messageData.to].sort();
        const conversationKey = `${users[0]}:${users[1]}`;
        
        // Stocker le message
        if (!conversations[conversationKey]) {
            conversations[conversationKey] = [];
        }
        
        const message = {
            sender: messageData.from,
            text: messageData.text,
            timestamp: new Date().getTime(),
            avatar: connectedUsers[socket.id].profilePic // Stocker l'avatar avec le message
        };
        
        conversations[conversationKey].push(message);
        
        // Sauvegarder le message dans la base de données si connecté
        try {
            if (mongoose.connection.readyState === 1) {
                await new Message({
                    conversationId: conversationKey,
                    sender: message.sender,
                    text: message.text,
                    timestamp: message.timestamp,
                    avatar: message.avatar
                }).save();
                console.log('Message sauvegardé dans la base de données');
            } else {
                // Sauvegarde dans le fichier JSON si MongoDB n'est pas disponible
                saveData();
            }
        } catch (err) {
            console.error('Erreur lors de la sauvegarde du message:', err);
        }
        
        // Trouver le socket du destinataire
        const recipientId = Object.keys(connectedUsers).find(
            id => connectedUsers[id].username === messageData.to
        );
        
        if (recipientId) {
            // Envoyer le message au destinataire
            io.to(recipientId).emit('newMessage', {
                from: messageData.from,
                text: messageData.text,
                avatar: connectedUsers[socket.id].profilePic
            });
            
            // Ne pas envoyer les conversations mises à jour au destinataire
            // car cela provoque des doublons avec l'événement 'newMessage'
        }
        
        // Confirmer l'envoi à l'expéditeur avec toutes les informations nécessaires
        socket.emit('messageSent', { 
            success: true, 
            message: {
                sender: messageData.from,
                to: messageData.to,
                text: messageData.text,
                timestamp: message.timestamp,
                avatar: connectedUsers[socket.id].profilePic
            } 
        });
        
        // Ne pas envoyer les conversations mises à jour à l'expéditeur
        // car cela provoque des doublons avec le message déjà ajouté localement
    });
    
    // Déconnexion d'un utilisateur
    socket.on('disconnect', () => {
        console.log('Utilisateur déconnecté:', socket.id);
        if (connectedUsers[socket.id]) {
            delete connectedUsers[socket.id];
            // Informer tous les utilisateurs de la liste mise à jour
            io.emit('userList', Object.values(connectedUsers));
        }
    });
});

// Routes principales
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'indexVide.html'));
});

// Route spécifique pour indexVide.html
app.get('/indexVide.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'indexVide.html'));
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});