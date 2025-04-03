document.addEventListener('DOMContentLoaded', function() {
	// Références aux éléments DOM
	const addFriendBtn = document.querySelector('.add-Friend');
	const friendList = document.querySelector('.friend-list');
	const chatMessages = document.querySelector('.chat-messages');
	const chatHeader = document.querySelector('.chat-header');
	const chatInput = document.querySelector('.chat-input');
	const sendBtn = document.querySelector('.chat-send-btn');
	
	// Initialisation de Socket.IO
	const socket = io();
	
	// Stockage des conversations et informations utilisateur
	const conversations = {};
	let currentFriend = null;
	let username = null;
	let profilePic = 'Image/me.webp';
	let onlineUsers = [];
	let myFriends = []; // Liste des amis de l'utilisateur
	let pendingFriendRequests = []; // Liste des demandes d'amitié en attente
	
	// Demander le nom d'utilisateur au chargement
	function promptUsername() {
		const modal = document.createElement('div');
		modal.className = 'add-friend-modal';
		
		modal.innerHTML = `
			<div class="modal-content">
				<h2>Bienvenue sur Z-Chat</h2>
				<div class="input-group">
					<label for="username">Votre nom d'utilisateur:</label>
					<input type="text" id="username" placeholder="Entrez votre nom d'utilisateur">
				</div>
				<div class="input-group">
					<label for="profile-pic">Photo de profil:</label>
					<input type="file" id="profile-pic" accept="image/*">
					<div class="preview-image"></div>
				</div>
				<div class="button-group">
					<button id="login-confirm">Connexion</button>
				</div>
			</div>
		`;
		
		document.body.appendChild(modal);
		
		// Prévisualisation de l'image
		const profilePicInput = document.getElementById('profile-pic');
		const previewDiv = document.querySelector('.preview-image');
		
		profilePicInput.addEventListener('change', function(event) {
			const file = event.target.files[0];
			if (file) {
				const reader = new FileReader();
				reader.onload = function(e) {
					previewDiv.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width: 100px; max-height: 100px;">`;
					previewDiv.dataset.image = e.target.result;
				};
				reader.readAsDataURL(file);
			}
		});
		
		// Gestion du bouton de connexion
		document.getElementById('login-confirm').addEventListener('click', function() {
			username = document.getElementById('username').value;
			profilePic = previewDiv.dataset.image || 'Image/me.webp';
			
			if (username) {
				// Enregistrer l'utilisateur auprès du serveur
				socket.emit('register', { username, profilePic });
			} else {
				alert('Veuillez entrer un nom d\'utilisateur');
			}
		});
		
		// Écouter la réponse du serveur pour l'enregistrement
		socket.on('registerResponse', function(response) {
			if (response.success) {
				// Mettre à jour l'interface utilisateur
				document.querySelector('.user-name').textContent = username;
				document.querySelector('.user-avatar img').src = profilePic;
				
				// Fermer le modal
				document.body.removeChild(modal);
			} else {
				// Afficher le message d'erreur
				alert(response.message);
			}
		});
	}
	
	// Appeler la fonction au chargement
	promptUsername();
	
	// Écouter les mises à jour de la liste d'utilisateurs
	socket.on('userList', function(users) {
		onlineUsers = users;
		updateFriendList();
	});
	
	// Écouter les mises à jour de la liste d'amis
	socket.on('friendList', function(friends) {
		myFriends = friends;
		updateFriendList();
	});
	
	// Écouter le chargement des conversations existantes
	socket.on('loadConversations', function(userConversations) {
		// Remplacer complètement les conversations locales par celles reçues du serveur
		// pour s'assurer que toutes les conversations sont correctement chargées
		Object.keys(userConversations).forEach(friend => {
			// Initialiser ou remplacer la conversation
			conversations[friend] = [];
			
			// Ajouter tous les messages de cette conversation
			if (userConversations[friend] && userConversations[friend].length > 0) {
				userConversations[friend].forEach(message => {
					conversations[friend].push(message);
				});
				
				// Trier les messages par timestamp
				conversations[friend].sort((a, b) => a.timestamp - b.timestamp);
			}
		});
		
		console.log('Conversations chargées:', conversations);
		
		// Si une conversation est actuellement affichée, la mettre à jour
		if (currentFriend && conversations[currentFriend]) {
			displayMessages(currentFriend);
		}
	});
	
	// Écouter les mises à jour des demandes d'amitié en attente
	socket.on('pendingFriendRequests', function(requests) {
		pendingFriendRequests = requests;
		updateFriendList();
		updatePendingRequestsBadge();
	});
	
	// Écouter les nouvelles demandes d'amitié
	socket.on('newFriendRequest', function(data) {
		// Afficher une notification
		alert(`${data.from} vous a envoyé une demande d'amitié !`);
	});
	
	// Écouter la confirmation d'envoi de demande d'amitié
	socket.on('friendRequestSent', function(data) {
		if (data.success) {
			alert(`Demande d'amitié envoyée à ${data.friendUsername}. En attente de confirmation.`);
		}
	});
	
	// Écouter la confirmation de rejet de demande d'amitié
	socket.on('friendRequestRejected', function(data) {
		if (data.success) {
			console.log(`Vous avez rejeté la demande d'amitié de ${data.friendUsername}.`);
		}
	});
	
	// Écouter la confirmation d'ajout d'ami
	socket.on('friendAdded', function(data) {
		if (data.success) {
			console.log(`${data.friendUsername} a été ajouté à votre liste d'amis.`);
		}
	});
	
	// Écouter la confirmation de suppression d'ami
	socket.on('friendRemoved', function(data) {
		if (data.success) {
			console.log(`${data.friendUsername} a été supprimé de votre liste d'amis.`);
		}
	});
	
	// Mettre à jour la liste des amis avec les utilisateurs en ligne
	function updateFriendList() {
		// Vider la liste actuelle
		friendList.innerHTML = '';
		
		// Afficher uniquement les amis de l'utilisateur
		myFriends.forEach(friendUsername => {
			// Trouver l'utilisateur correspondant dans la liste des utilisateurs en ligne
			const user = onlineUsers.find(u => u.username === friendUsername);
			if (user) {
				// L'ami est en ligne
				addFriend(user.username, user.profilePic);
			} else {
				// L'ami n'est pas en ligne, utiliser une image par défaut
				addFriend(friendUsername, 'Image/Friends.webp');
			}
		});
		
		// Mettre à jour le badge des demandes d'amitié
		updatePendingRequestsBadge();
	}
	
	// Fonction pour mettre à jour le badge des demandes d'amitié
	function updatePendingRequestsBadge() {
		// Supprimer l'ancien badge s'il existe
		const oldBadge = addFriendBtn.querySelector('.friend-requests-badge');
		if (oldBadge) {
			addFriendBtn.removeChild(oldBadge);
		}
		
		// Ajouter un nouveau badge si nécessaire
		if (pendingFriendRequests.length > 0) {
			const badge = document.createElement('div');
			badge.className = 'friend-requests-badge';
			badge.textContent = pendingFriendRequests.length;
			addFriendBtn.appendChild(badge);
		}
	}
	
	// Fonction pour créer l'interface d'ajout d'ami
	function showAddFriendInterface() {
		// Créer un modal/popup pour l'ajout d'ami
		const modal = document.createElement('div');
		modal.className = 'add-friend-modal';
		
		modal.innerHTML = `
			<div class="modal-content">
				<h2>Ajouter un ami</h2>
				<div class="input-group">
					<label for="friend-search">Rechercher un utilisateur:</label>
					<input type="text" id="friend-search" placeholder="Entrez un nom d'utilisateur">
				</div>
				<div class="search-results">
					<!-- Les résultats de recherche seront affichés ici -->
				</div>
				<div class="pending-requests">
					<h3>Demandes d'amitié en attente</h3>
					<div class="pending-list">
						<!-- Les demandes d'amitié en attente seront affichées ici -->
					</div>
				</div>
				<div class="button-group">
					<button id="add-friend-cancel">Fermer</button>
				</div>
			</div>
		`;
		
		document.body.appendChild(modal);
		
		const searchInput = document.getElementById('friend-search');
		const searchResults = document.querySelector('.search-results');
		const pendingList = document.querySelector('.pending-list');
		
		// Afficher les demandes d'amitié en attente
		updatePendingRequestsList(pendingList);
		
		// Fonction pour rechercher des utilisateurs
		function searchUsers(query) {
			searchResults.innerHTML = '';
			
			if (!query.trim()) {
				return;
			}
			
			// Filtrer les utilisateurs en ligne qui correspondent à la recherche
			const matchingUsers = onlineUsers.filter(user => 
				user.username !== username && // Exclure l'utilisateur actuel
				user.username.toLowerCase().includes(query.toLowerCase())
			);
			
			if (matchingUsers.length === 0) {
				searchResults.innerHTML = '<div class="no-results">Aucun utilisateur trouvé</div>';
				return;
			}
			
			// Afficher les résultats de recherche
			matchingUsers.forEach(user => {
				const userElement = document.createElement('div');
				userElement.className = 'search-result';
				userElement.innerHTML = `
					<div class="result-avatar">
						<img src="${user.profilePic}" alt="${user.username}">
					</div>
					<div class="result-info">
						<div class="result-name">${user.username}</div>
						<div class="result-status">en ligne</div>
					</div>
					<button class="add-result-btn">Ajouter</button>
				`;
				
				searchResults.appendChild(userElement);
				
				// Ajouter un événement pour le bouton d'ajout
				const addBtn = userElement.querySelector('.add-result-btn');
				addBtn.addEventListener('click', function() {
					// Vérifier si l'utilisateur est déjà un ami
					if (myFriends.includes(user.username)) {
						alert(`${user.username} est déjà dans votre liste d'amis.`);
					} else {
						// Envoyer la demande d'ajout d'ami au serveur
						socket.emit('addFriend', {
							username: username,
							friendUsername: user.username
						});
					}
				});
			});
		}
		
		// Événement de saisie pour la recherche
		searchInput.addEventListener('input', function() {
			searchUsers(this.value);
		});
		
		// Gestion du bouton de fermeture
		document.getElementById('add-friend-cancel').addEventListener('click', function() {
			document.body.removeChild(modal);
		});
		
		// Fonction pour mettre à jour la liste des demandes d'amitié en attente
		function updatePendingRequestsList(container) {
			container.innerHTML = '';
			
			if (pendingFriendRequests.length === 0) {
				container.innerHTML = '<div class="no-requests">Aucune demande d\'amitié en attente</div>';
				return;
			}
			
			pendingFriendRequests.forEach(requesterUsername => {
				const requestElement = document.createElement('div');
				requestElement.className = 'pending-request';
				
				// Trouver l'utilisateur dans la liste des utilisateurs en ligne
				const requester = onlineUsers.find(u => u.username === requesterUsername);
				const profilePic = requester ? requester.profilePic : 'Image/Friends.webp';
				
				requestElement.innerHTML = `
					<div class="request-avatar">
						<img src="${profilePic}" alt="${requesterUsername}">
					</div>
					<div class="request-info">
						<div class="request-name">${requesterUsername}</div>
						<div class="request-status">${requester ? 'en ligne' : 'hors ligne'}</div>
					</div>
					<div class="request-actions">
						<button class="accept-request-btn">Accepter</button>
						<button class="reject-request-btn">Rejeter</button>
					</div>
				`;
				
				container.appendChild(requestElement);
				
				// Ajouter des événements pour les boutons d'acceptation et de rejet
				const acceptBtn = requestElement.querySelector('.accept-request-btn');
				const rejectBtn = requestElement.querySelector('.reject-request-btn');
				
				acceptBtn.addEventListener('click', function() {
					socket.emit('acceptFriendRequest', {
						username: username,
						friendUsername: requesterUsername
					});
				});
				
				rejectBtn.addEventListener('click', function() {
					socket.emit('rejectFriendRequest', {
						username: username,
						friendUsername: requesterUsername
					});
				});
			});
		}
	}
	
	// Fonction pour ajouter un ami
	function addFriend(friendUsername, profilePic) {
		// Vérifier si l'ami existe déjà
		const existingFriend = Array.from(document.querySelectorAll('.friend')).find(el => 
			el.querySelector('.friend-name').textContent === friendUsername
		);
		
		if (existingFriend) {
			return; // Ne pas ajouter de doublons
		}
		// Créer un nouvel élément ami
		const friendElement = document.createElement('button');
		friendElement.className = 'friend';
		friendElement.innerHTML = `
			<div class="friend-avatar">
				<img src="${profilePic}" alt="${friendUsername}">
			</div>
			<div class="friend-info">
				<div class="friend-name">${friendUsername}</div>
				<div class="friend-status">online</div>
			</div>
			<div class="friend-remove">&times;</div>
		`;
		
		// Ajouter l'ami à la liste
		friendList.appendChild(friendElement);
		
		// Initialiser le tableau des messages de cet ami s'il n'existe pas déjà
		if (!conversations[friendUsername]) {
			conversations[friendUsername] = [];
		}
		
		// Ajouter un événement de clic pour afficher la conversation
		friendElement.addEventListener('click', function(e) {
			// Si on clique sur la croix, supprimer l'ami
			if (e.target.classList.contains('friend-remove')) {
				e.stopPropagation(); // Empêcher la propagation du clic
				removeFriend(friendUsername, friendElement);
			} else {
				showConversation(friendUsername, profilePic);
			}
		});
		
		// Ajouter un événement spécifique pour la croix de suppression
		const removeBtn = friendElement.querySelector('.friend-remove');
		if (removeBtn) {
			removeBtn.addEventListener('click', function(e) {
				e.stopPropagation(); // Empêcher la propagation du clic
				removeFriend(friendUsername, friendElement);
			});
		}
	}
	
	// Fonction pour afficher la conversation d'un ami
	function showConversation(friendUsername, profilePic) {
		// Mettre à jour l'ami actuel
		currentFriend = friendUsername;
		
		// Mettre à jour l'en-tête du chat
		chatHeader.innerHTML = `
			<div class="chat-avatar">
				<img src="${profilePic}" alt="${friendUsername}">
			</div>
			<div class="chat-name">${friendUsername}</div>
		`;
		
		// Supprimer la notification si elle existe
		const friendElement = Array.from(document.querySelectorAll('.friend')).find(el => 
			el.querySelector('.friend-name').textContent === friendUsername
		);
		
		if (friendElement) {
			const notificationBadge = friendElement.querySelector('.notification-badge');
			if (notificationBadge) {
				friendElement.removeChild(notificationBadge);
			}
		}
		
		// Afficher les messages de la conversation
		displayMessages(friendUsername);
	}
	
	// Fonction pour afficher les messages d'une conversation
	function displayMessages(friendUsername) {
		chatMessages.innerHTML = '';
		
		// Récupérer les messages de la conversation
		const messages = conversations[friendUsername] || [];
		
		// Afficher chaque message
		messages.forEach(message => {
			const messageGroup = document.createElement('div');
			messageGroup.className = 'message-group';
			if (message.sender === 'me') {
				messageGroup.classList.add('self');
			}
			
			// Utiliser l'avatar stocké dans le message ou utiliser une valeur par défaut
			const avatarSrc = message.avatar || (message.sender === 'me' ? profilePic : 'Image/Friends.webp');
			
			messageGroup.innerHTML = `
				<div class="message-header">
					<div class="message-avatar">
						<img src="${avatarSrc}" alt="${message.sender}">
					</div>
					<div class="message-name">${message.sender === 'me' ? username : friendUsername}</div>
				</div>
				<div class="message-bubble">
					${message.text}
				</div>
			`;
			
			chatMessages.appendChild(messageGroup);
		});
		
		
		// Faire défiler jusqu'au dernier message
		chatMessages.scrollTop = chatMessages.scrollHeight;
	}
	
	// Fonction pour envoyer un message
	function sendMessage() {
		const messageText = chatInput.value.trim();
		
		if (messageText && currentFriend) {
			// Ne pas ajouter le message à la conversation locale immédiatement
			// pour éviter les doublons avec l'événement 'messageSent'
			
			// Envoyer le message au serveur
			socket.emit('sendMessage', {
				from: username,
				to: currentFriend,
				text: messageText
			});
			
			// Effacer le champ de saisie
			chatInput.value = '';
		}
	}
	
	// Écouter la confirmation d'envoi de message
	socket.on('messageSent', function(data) {
		if (data.success && data.message) {
			// Ajouter le message à la conversation locale
			const friendUsername = data.message.sender === username ? data.message.to : data.message.sender;
			
			if (!conversations[friendUsername]) {
				conversations[friendUsername] = [];
			}
			
			// Ajouter le message avec le bon format
			conversations[friendUsername].push({
				sender: 'me',
				text: data.message.text,
				avatar: profilePic,
				timestamp: data.message.timestamp
			});
			
			// Afficher la conversation mise à jour si l'ami est actuellement sélectionné
			if (currentFriend === friendUsername) {
				displayMessages(friendUsername);
			}
		}
	});
	
	// Écouter les nouveaux messages
	socket.on('newMessage', function(message) {
		// Ajouter le message à la conversation
		if (!conversations[message.from]) {
			conversations[message.from] = [];
		}
		
		conversations[message.from].push({
			sender: message.from,
			text: message.text,
			avatar: message.avatar,
			timestamp: new Date().getTime() // Ajouter un timestamp pour éviter les doublons
		});
		
		// Afficher la conversation mise à jour si l'ami est actuellement sélectionné
		if (currentFriend === message.from) {
			displayMessages(message.from);
		} else {
			// Ajouter une notification
			const friendElement = Array.from(document.querySelectorAll('.friend')).find(el => 
				el.querySelector('.friend-name').textContent === message.from
			);
			
			if (friendElement) {
				// Vérifier si une notification existe déjà
				let notificationBadge = friendElement.querySelector('.notification-badge');
				
				if (notificationBadge) {
					// Incrémenter le compteur
					const count = parseInt(notificationBadge.textContent) || 0;
					notificationBadge.textContent = count + 1;
				} else {
					// Créer une nouvelle notification
					notificationBadge = document.createElement('div');
					notificationBadge.className = 'notification-badge';
					notificationBadge.textContent = '1';
					friendElement.appendChild(notificationBadge);
				}
			}
		}
	});
	
	// Fonction pour supprimer un ami
	function removeFriend(friendUsername, friendElement) {
		// Demander confirmation
		if (confirm(`Voulez-vous vraiment supprimer ${friendUsername} de votre liste d'amis ?`)) {
			// Envoyer la demande de suppression d'ami au serveur
			socket.emit('removeFriend', {
				username: username, // Nom d'utilisateur actuel
				friendUsername: friendUsername // Nom de l'ami à supprimer
			});
			
			// Supprimer l'élément de la liste d'amis
			friendList.removeChild(friendElement);
			
			// Supprimer les conversations associées
			delete conversations[friendUsername];
			
			// Si l'ami supprimé était l'ami actuel, réinitialiser l'interface de chat
			if (currentFriend === friendUsername) {
				currentFriend = null;
				chatHeader.innerHTML = `
					<div class="chat-avatar">
						<img src="Image/Friends.webp" alt="Ajouter des amis">
					</div>
					<div class="chat-name">Ajouter des amis</div>
				`;
				chatMessages.innerHTML = '';
			}
		}
	}
	
	// Événements
	addFriendBtn.addEventListener('click', showAddFriendInterface);
	
	sendBtn.addEventListener('click', sendMessage);
	
	chatInput.addEventListener('keypress', function(e) {
		if (e.key === 'Enter') {
			sendMessage();
		}
	});
	
});

// Ajout de styles dynamiques
const styles = document.createElement('style');
styles.textContent = `
.add-friend-modal {
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	background-color: rgba(0, 0, 0, 0.7);
	display: flex;
	justify-content: center;
	align-items: center;
	z-index: 1000;
}

.modal-content {
	background-color: #222;
	border-radius: 8px;
	padding: 20px;
	width: 350px;
	color: white;
}

.modal-content h2 {
	margin-bottom: 20px;
	text-align: center;
}

.input-group {
	margin-bottom: 15px;
}

.input-group label {
	display: block;
	margin-bottom: 5px;
}

.input-group input {
	width: 100%;
	padding: 8px;
	border-radius: 4px;
	background-color: #333;
	border: 1px solid #444;
	color: white;
}

.preview-image {
	margin-top: 10px;
	min-height: 50px;
	display: flex;
	justify-content: center;
}

.button-group {
	display: flex;
	justify-content: space-between;
	margin-top: 20px;
}

.button-group button {
	padding: 8px 15px;
	border-radius: 4px;
	border: none;
	cursor: pointer;
}

#add-friend-confirm, #login-confirm {
	background-color: #ff9900;
	color: white;
}

#add-friend-cancel {
	background-color: #555;
	color: white;
}

.message-group.self {
	align-self: flex-start;
}

.message-bubble {
	background-color: #333;
	padding: 10px 15px;
	border-radius: 18px;
	margin-bottom: 5px;
}

.message-group.self .message-bubble {
	background-color:rgb(44, 44, 44);
}

.notification-badge, .friend-requests-badge {
	position: absolute;
	right: 15px;
	background-color: #ff0000;
	color: white;
	width: 20px;
	height: 20px;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 12px;
}

.friend-requests-badge {
	right: 5px;
	top: 5px;
}

.friend-remove {
	position: absolute;
	right: 10px;
	top: 50%;
	transform: translateY(-50%);
	color: #999;
	font-size: 18px;
	cursor: pointer;
	width: 20px;
	height: 20px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 50%;
	transition: all 0.2s ease;
	z-index: 5;
}

.friend-remove:hover {
	background-color: rgba(255, 0, 0, 0.2);
	color: #ff0000;
}

.friend {
	position: relative;
}

.search-results {
	max-height: 200px;
	overflow-y: auto;
	margin: 10px 0;
	background-color: #333;
	border-radius: 4px;
}

.search-result {
	display: flex;
	align-items: center;
	padding: 10px;
	border-bottom: 1px solid #444;
	position: relative;
}

.search-result:last-child {
	border-bottom: none;
}

.pending-requests {
	margin-top: 20px;
	border-top: 1px solid #444;
	padding-top: 10px;
}

.pending-requests h3 {
	margin-bottom: 10px;
	font-size: 16px;
	color: #ccc;
}

.pending-list {
	max-height: 150px;
	overflow-y: auto;
}

.pending-request {
	display: flex;
	align-items: center;
	padding: 10px;
	border-bottom: 1px solid #444;
	position: relative;
}

.request-avatar {
	width: 40px;
	height: 40px;
	border-radius: 50%;
	overflow: hidden;
	margin-right: 10px;
}

.request-avatar img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.request-info {
	flex: 1;
}

.request-name {
	font-weight: bold;
	color: #fff;
}

.request-status {
	font-size: 12px;
	color: #999;
}

.request-actions {
	display: flex;
	gap: 5px;
}

.accept-request-btn, .reject-request-btn {
	padding: 5px 10px;
	border-radius: 4px;
	border: none;
	cursor: pointer;
	font-size: 12px;
}

.accept-request-btn {
	background-color: #4CAF50;
	color: white;
}

.reject-request-btn {
	background-color: #f44336;
	color: white;
}

.no-requests {
	padding: 10px;
	color: #999;
	text-align: center;
	font-style: italic;
}

.result-avatar {
	width: 40px;
	height: 40px;
	border-radius: 50%;
	overflow: hidden;
	margin-right: 10px;
}

.result-avatar img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.result-info {
	flex: 1;
}

.result-name {
	font-weight: bold;
	color: white;
}

.result-status {
	font-size: 12px;
	color: #aaa;
}

.add-result-btn {
	background-color: #ff9900;
	color: white;
	border: none;
	border-radius: 4px;
	padding: 5px 10px;
	cursor: pointer;
}

.no-results {
	padding: 15px;
	text-align: center;
	color: #aaa;
}
`;
document.head.appendChild(styles);