async function startJoin(){
	await join();
}
  /*
 *  These procedures use Agora Video Call SDK for Web to enable local and remote
 *  users to join and leave a Video Call channel managed by Agora Platform.
 */

/*
 *  Create an {@link https://docs.agora.io/en/Video/API%20Reference/web_ng/interfaces/iagorartcclient.html|AgoraRTCClient} instance.
 *
 * @param {string} mode - The {@link https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/clientconfig.html#mode| streaming algorithm} used by Agora SDK.
 * @param  {string} codec - The {@link https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/clientconfig.html#codec| client codec} used by the browser.
 */
var client = [];

/*
 * Clear the video and audio tracks used by `client` on initiation.
 */
var localTracks = [];

/*
 * On initiation no users are connected.
 */
var remoteUsers = {};

var already_started = false;
var num_streams = 0;
var group_size = 0;
var time_left = 0;
var timer_itv = '';
var skip_itv = '';
var audioOnly = '';
var videoOnly = '';
var recording = '';
var channelName = '';
var agora_router_url = '';
var token = '';
var participantRole = '';
var allowSkip = '';
var skipAfter = '';
var lastJoinItv = '';
var timeToWait = '';

const subscribeQueue = new Map();   // uid -> Promise chain (serialize per user)
const pendingMedia = new Map();     // uid -> Set("audio"|"video")
const subscribed = new Set();       // "uid:mediaType" to avoid duplicates
/*
 * On initiation. `client` is not attached to any project or channel for any specific user.
 */
options = {
        mode:null,
        codec:null,
        appID:null,
        channel: null,
        uid:null,
        token:null,
      };

(function () {
  const nativeRemove = Element.prototype.remove;

  Element.prototype.remove = function () {
    // If already detached, do nothing (prevents parentNode.removeChild null crash)
    if (!this || !this.parentNode) return;

    try {
      // Prefer native behavior if available
      if (nativeRemove) return nativeRemove.call(this);
      return this.parentNode.removeChild(this);
    } catch (e) {
      // Swallow errors so Agora cleanup doesn't break the page
      return;
    }
  };
})();

AgoraRTC.onAutoplayFailed = () => {
  alert("click to start autoplay!")
}

AgoraRTC.onMicrophoneChanged = async (changedDevice) => {
  // When plugging in a device, switch to a device that is newly plugged in.
  if (changedDevice.state === "ACTIVE") {
    localTracks.audioTrack.setDevice(changedDevice.device.deviceId);
    // Switch to an existing device when the current device is unplugged.
  } else if (changedDevice.device.label === localTracks.audioTrack.getTrackLabel()) {
    const oldMicrophones = await AgoraRTC.getMicrophones();
    oldMicrophones[0] && localTracks.audioTrack.setDevice(oldMicrophones[0].deviceId);
  }
}

AgoraRTC.onCameraChanged = async (changedDevice) => {
  // When plugging in a device, switch to a device that is newly plugged in.
  if (changedDevice.state === "ACTIVE") {
    localTracks.videoTrack.setDevice(changedDevice.device.deviceId);
    // Switch to an existing device when the current device is unplugged.
  } else if (changedDevice.device.label === localTracks.videoTrack.getTrackLabel()) {
    const oldCameras = await AgoraRTC.getCameras();
    oldCameras[0] && localTracks.videoTrack.setDevice(oldCameras[0].deviceId);
  }
}




/*
 * Join a channel, then create local video and audio tracks and publish them to the channel.
 */
async function join() {

  // Add an event listener to play remote tracks when remote user publishes.
  client.on("user-published", handleUserPublished);
  client.on("user-unpublished", handleUserUnpublished);

  console.log(options);
  // Join a channel and create local tracks. Best practice is to use Promise.all and run them concurrently.
  [ options.uid, localTracks.audioTrack, localTracks.videoTrack ] = await Promise.all([
    // Join the channel.
    client.join(options.appID, options.channel, options.token || null, options.uid || null),
    // Create tracks to the local microphone and camera.
    AgoraRTC.createMicrophoneAudioTrack(),
    AgoraRTC.createCameraVideoTrack()
  ]);

  if(audioOnly == 'true'){
  	console.log('audioOnly');
   await localTracks.videoTrack.setEnabled(false);
   await client.publish(localTracks.audioTrack);
   localTracks.videoTrack.play("local-player");
   localTracks.audioTrack.play();
   jQuery('#local-player > div').css('background-color','white').css('display','table').css('border','3px solid black').append(`<h3 class='audio-name'>${participantRole}</h3>`);
   jQuery('.agora_video_player').css('display','none');
  }
  else if(videoOnly == 'true'){
  	console.log('videoOnly');
   await localTracks.audioTrack.setEnabled(false);
   await client.publish(localTracks.videoTrack);
   localTracks.videoTrack.play("local-player");
  }
  else{
  	console.log('neither');
   await client.publish(localTracks.audioTrack);
   await client.publish(localTracks.videoTrack);
   localTracks.videoTrack.play("local-player");
  }

  console.log(options.uid==1);
  console.log(options.uid);
  if(options.uid == 1 && recording != "false"){
  	console.log('sending acquire');
	jQuery.ajax({
	        type: "POST",
	        url: agora_router_url+"/acquire",
	        data: JSON.stringify({
	        "cName":options.channel
	        }),
	        success: function(data){
	          //console.log(data);
	          resourceId = data['resourceId'];
	          jQuery.ajax({
	            type:"POST",
	            url:agora_router_url+"/start",
	            data: JSON.stringify({
	              "resourceId":data['resourceId'],
	              "cName":options.channel,
	              "token":options.token
	            }),
	            success: function(data){
	              sid= data['sid'];
	            },
	            contentType: "application/json; charset=UTF-8"
	          })
	        },
	        contentType: "application/json; charset=UTF-8"
	      });


  }

  if(!already_started && (group_size == 1 || client.remoteUsers.length == group_size - 1)){
  	console.log("timer started solo / group full");
  	already_started = true;
  	timer_itv = setInterval(function() {
                  console.log(time_left);
                  time_left -= 1;
                  jQuery('#timer').text(Math.floor(time_left / 60).toString().padStart(2,'0') + ':' + (time_left % 60).toString().padStart(2,'0'));
                  if (time_left <= 0){
                      clearInterval(timer_itv);
                      Qualtrics.SurveyEngine.setEmbeddedData("callCompleted", "true");
                      jQuery('#NextButton').click();}
                },1000);
  }

  num_streams += 1;
  

  
}

/*
 * Stop all local and remote tracks then leave the channel.
 */
async function leave() {
  console.log('leaving');
  for (trackName in localTracks) {
    var track = localTracks[trackName];
    if(track) {
      track.stop();
      try{
		track.close();
      }
      catch(error){
      	console.log(error);
      }
      	
      localTracks[trackName] = undefined;
    }
  }

  // Remove remote users and player views.
  remoteUsers = {};

  console.log('leaving client');
  // leave the channel
  await client.leave();


  console.log("client leaves channel success");
}


/*
 * Add the local use to a remote channel.
 *
 * @param  {IAgoraRTCRemoteUser} user - The {@link  https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/iagorartcremoteuser.html| remote user} to add.
 * @param {trackMediaType - The {@link https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/itrack.html#trackmediatype | media type} to add.
 */
async function subscribe(user, mediaType) {
  const uid = user.uid;
  console.log("MEDIA TYPE:", mediaType, "uid:", uid);

  // mark requested media type
  if (!pendingMedia.has(uid)) pendingMedia.set(uid, new Set());
  pendingMedia.get(uid).add(mediaType);

  // serialize per uid
  const prev = subscribeQueue.get(uid) || Promise.resolve();

  const next = prev.then(async () => {
    const set = pendingMedia.get(uid);
    if (!set || set.size === 0) return;

    // ALWAYS do audio first, then video
    const order = ["audio", "video"];
    for (const type of order) {
      if (!set.has(type)) continue;

      const key = `${uid}:${type}`;
      if (subscribed.has(key)) {
        set.delete(type);
        continue;
      }

      subscribed.add(key);
      try {
        await client.subscribe(user, type);
        console.log("subscribe success", uid, type);
        set.delete(type);
      } catch (err) {
        // allow retry later
        subscribed.delete(key);
        console.error("subscribe failed", uid, type, err);
        throw err;
      }

      // ---- play logic (after subscribe) ----
      const name_param = (nameDisplay == 'true') ? '' : 'style="display:none"';

      if (type === "video") {
        // avoid duplicate DOM
        if (!document.getElementById(`player-wrapper-${uid}`)) {
          const player = jQuery(`
            <div id="player-wrapper-${uid}">
              <p class="player-name" ${name_param}>${rolelist[uid - 1]}</p>
              <div id="player-${uid}" class="player"></div>
            </div>
          `);
          jQuery("#remote-playerlist").append(player);
        }
        user.videoTrack && user.videoTrack.play(`player-${uid}`);
      }

      if (type === "audio") {
        user.audioTrack && user.audioTrack.play();

        if (audioOnly == 'true') {
          if (!document.getElementById(`player-wrapper-${uid}`)) {
            const player = jQuery(`
              <div id="player-wrapper-${uid}">
                <p class="player-name" ${name_param}>${rolelist[uid - 1]}</p>
                <div id="player-${uid}" class="player"></div>
              </div>
            `);
            jQuery("#remote-playerlist").append(player);
          }

          if (!jQuery(`#player-${uid} > div`).length) {
            jQuery(`#player-${uid}`).append(
              `<div style="width: 100%; height: 100%; position: relative; overflow: hidden; background-color: white; display: table; border: 3px solid black;"></div>`
            );
            jQuery(`#player-${uid} > div`)
              .css('background-color', 'white')
              .css('display', 'table')
              .css('border', '3px solid black')
              .append(`<h3 class='audio-name'>${rolelist[uid - 1]}</h3>`);
            jQuery('.agora_video_player').css('display','none');
          }
        }
      }
    }

    // timer logic (unchanged)
    if (!already_started) {
      clearTimeout(lastJoinItv);

      if (client.remoteUsers.length >= group_size - 1) {
        already_started = true;
        timer_itv = setInterval(function () {
          time_left -= 1;
          jQuery('#timer').text(
            Math.floor(time_left / 60).toString().padStart(2, '0') +
            ':' +
            (time_left % 60).toString().padStart(2, '0')
          );
          if (time_left <= 0) {
            clearInterval(timer_itv);
            Qualtrics.SurveyEngine.setEmbeddedData("callCompleted", "true");
            jQuery('#NextButton').click();
          }
        }, 1000);
      } else {
        lastJoinItv = setTimeout(function () {
          already_started = true;
          timer_itv = setInterval(function () {
            time_left -= 1;
            jQuery('#timer').text(
              Math.floor(time_left / 60).toString().padStart(2, '0') +
              ':' +
              (time_left % 60).toString().padStart(2, '0')
            );
            if (time_left <= 0) {
              clearInterval(timer_itv);
              Qualtrics.SurveyEngine.setEmbeddedData("callCompleted", "true");
              jQuery('#NextButton').click();
            }
          }, 1000);
        }, timeToWait * 1000);
      }
    }
  }).catch(e => console.error("subscribe chain error", uid, e));

  subscribeQueue.set(uid, next);
  return next;
}

async function subscribePendingForUser(user) {
  const uid = user.uid;
  const set = pendingMedia.get(uid);
  if (!set || set.size === 0) return;

  // Always do audio first, then video (stable order)
  const order = ["audio", "video"];

  for (const type of order) {
    if (!set.has(type)) continue;

    await subscribe(user, type);   // calls your subscribe() below
    set.delete(type);
  }
}

/*
 * Add a user who has subscribed to the live channel to the local interface.
 *
 * @param  {IAgoraRTCRemoteUser} user - The {@link  https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/iagorartcremoteuser.html| remote user} to add.
 * @param {trackMediaType - The {@link https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/itrack.html#trackmediatype | media type} to add.
 */
function handleUserPublished(user, mediaType) {
  console.log("user published", user.uid, mediaType);
  remoteUsers[user.uid] = user;
  subscribe(user, mediaType); // now subscribe() itself queues/serializes
}

/*
 * Remove the user specified from the channel in the local interface.
 *
 * @param  {string} user - The {@link  https://docs.agora.io/en/Voice/API%20Reference/web_ng/interfaces/iagorartcremoteuser.html| remote user} to remove.
 */
function handleUserUnpublished(user, mediaType) {
	console.log('user unpublished');

  if (mediaType === 'video') {
    const id = user.uid;
    delete remoteUsers[id];
    console.log('TEST:');
    console.log(remoteUsers);
    if(jQuery.isEmptyObject(remoteUsers) && time_left > 0){
    	clearInterval(timer_itv);
        jQuery('#NextButton').click();
    }
    jQuery(`#player-wrapper-${id}`).remove();

  }
}
