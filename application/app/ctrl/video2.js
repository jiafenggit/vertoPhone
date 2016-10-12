const app = angular.module('videoCall', ['app.directive', 'ngSanitize']);

app.run(($rootScope, $document, $timeout) => {
    let room,
        _call,
        _session;

    const chatScrollTop = () => {
        const objDiv = document.getElementById("chatDataUl");
        objDiv.scrollTop = objDiv.scrollHeight;
    };

    const getMemberKeyByUuid = uuid => {
        for (let key in $rootScope.members) {
            if ($rootScope.members[key].uuid == uuid)
                return key;
        }
        return -1;
    };

    const localMemberChangeMedia = m => {
        if (m.status && m.status.audio) {
            $rootScope.muteLocalAudio = m.status.audio.muted;
        }

        if (m.status && m.status.video) {
            $rootScope.muteLocalVideo = m.status.video.muted;
        }
    };

    $rootScope.messages = [];
    $rootScope.unReadMessageCount = 0;
    $rootScope.isConf = false;
    $rootScope.screenShareCall = false;
    $rootScope.screenShareCallDirection = null;
    $rootScope.useVideo = false;
    window.init = (session, call) => {
        console.log('init', call, session);
        _call = call;
        _session = session;
        $rootScope.startTime = call.onActiveTime;
        $rootScope.muteLocalAudio = !!call.mute;
        $rootScope.muteLocalVideo = !!call.muteVideo;
        $rootScope.useVideo = !!call.useVideo;

        call.onChange = action => {
            switch (action) {
                case 'removeScreenShareCall':
                    $rootScope.screenShareCall = false;
                    $rootScope.screenShareCallDirection = null;
                    break;

                case 'setScreenShareCall':
                    $rootScope.screenShareCall = true;
                    $rootScope.screenShareCallDirection = angular.copy(_call.screenShareCallDirection);
                    break;
            }
            apply();
        };

        room = call.conferenceId && session.conference[call.conferenceId];

        if (call.screenShareCall && !room) {
            $rootScope.screenShareCall = true;
            $rootScope.screenShareCallDirection = angular.copy(_call.screenShareCallDirection);
        }

        if (room) {
            $rootScope.isConf = true;
            for (let key in room.members) {
                $rootScope.members.push(angular.copy(room.members[key]));
                if (key == room.callId) {
                    let myInfo =  room.members[key];
                    localMemberChangeMedia(myInfo);
                }
            }
            
            $rootScope.layouts = angular.copy(room.layouts) || [];
            $rootScope.layoutsInfo = angular.copy(room.layoutsInfo) || {};
            $rootScope.messages = angular.copy(room.messages);
            $rootScope.canvasInfo = angular.copy(room.canvasInfo);

            room.onChange = (action, data) => {
                let key;
                switch (action) {
                    case 'addMessage':
                        if ($rootScope.activeTab != 'c') {
                            $rootScope.unReadMessageCount++;
                        }
                        $rootScope.messages.push(angular.copy(data));
                        $timeout(() => chatScrollTop(), 500);
                        break;
                    case 'changeMembers:add':
                        $rootScope.members.push(angular.copy(data));
                        break;
                    case 'changeMembers:del':
                        key = getMemberKeyByUuid(data);
                        if (key === -1) {
                            return console.error('No found member');
                        }

                        $rootScope.members.splice(key, 1);
                        break;
                    case 'changeMembers:clear':
                        $rootScope.members = [];
                        break;
                    case 'changeMembers:modify':
                        key = getMemberKeyByUuid(data.uuid);
                        if (key === -1) {
                            return console.error('No found member');
                        }

                        angular.extend($rootScope.members[key], data);

                        if (data.uuid == room.callId) {
                            localMemberChangeMedia(data);
                        }
                        break;

                    case 'changeConvas':
                        $rootScope.canvasInfo = angular.copy(data);
                        break;

                }
                apply();
            };
        }
        apply();
    };

    $rootScope.message = "";
    $rootScope.sendChat = ($event) => {
        $event.stopPropagation();
        if (!$rootScope.message)
            return;
        room.conf.sendChat($rootScope.message);
        $rootScope.message = "";
    };

    $rootScope.hangupCall = () => {
        _session.dropCall(_call.id);
    };

    $rootScope.data = {};
    $rootScope.$watch('data.layout', (v, oldV) => {
        if (v) {
            room.setVideoLayout(v, null);
        }
    });

    $rootScope.confResId = (mId, v) => {
        room.setVidResId(mId, v);
    };

    $rootScope.selectedMemberId = "";
    $rootScope.selectMember = id => {
        if (id == $rootScope.selectedMemberId) {
            $rootScope.selectedMemberId = "";
        } else {
            $rootScope.selectedMemberId = id;
        }
    };

    $rootScope.layouts = [];

    $rootScope.confChangeVolume = (memberId, pos, $event) => {
        if (pos == 'up') {
            room.conf.volumeUp(memberId);
        } else {
            room.conf.volumeDown(memberId);
        }
        $event.stopPropagation();
    };

    $rootScope.confChangeGain = (memberId, pos, $event) => {
        if (pos == 'up') {
            room.conf.gainUp(memberId);
        } else {
            room.conf.gainDown(memberId);
        }
        $event.stopPropagation();
    };

    $rootScope.confDeaf = (memberId, deafStatus, $event) => {
        if (room.confRole == 'moderator') {
            if (deafStatus) {
                room.conf.undeaf(memberId);
            } else {
                room.conf.deaf(memberId);
            }
        }
        $event.stopPropagation();
    };

    $rootScope.confKick = (memberId, $event) => {
        room.conf.kick(memberId);
        $event.stopPropagation();
    };

    $rootScope.confSetVideoFloor = (memberId, $event) => {
        room.conf.videoFloor(memberId);
        $event.stopPropagation();        
    };

    $rootScope.toggleMuteMic = (memberId, $event) => {
        if (room) {
            room.conf.muteMic(memberId || room.id);
        } else {
            _session.toggleMute(_call.id);
            $rootScope.muteLocalAudio = !!_call.mute;
        }
        $event.stopPropagation();
    };

    $rootScope.toggleMuteVid = (memberId, $event) => {
        if (!$rootScope.useVideo) return;
        if (room) {
            room.conf.muteVideo(memberId || room.id);
        } else {
            _session.toggleMuteVideo(_call.id);
            $rootScope.muteLocalVideo = !!_call.muteVideo;
        }
        $event.stopPropagation();
    };

    $rootScope.dtmf = (digit, $event) => {
        _session.dtmf(_call.id, digit);
        $event.stopPropagation();
    };

    $rootScope.screenShare = ($event) => {
        _session.screenShare(_call.id, {});
        $event.stopPropagation();
    };
    
    $rootScope.members = [];

    $rootScope.initPage = true;
    $timeout(() => {
        $rootScope.initPage = false;
    }, 5000);
    $rootScope.activeMember = null;
    $rootScope.setActiveMember = m => {
        $rootScope.activeMember = m;
    };

    function apply() {
        $timeout(() => {
            $rootScope.$apply();
        })
    }


    $rootScope.isFullScreen = false;
    $rootScope.toggleFullScreen = () => {
        if (document.webkitCurrentFullScreenElement) {
            document.webkitExitFullscreen();
            $rootScope.isFullScreen = false;
        } else {
            document.body.webkitRequestFullscreen();
            $rootScope.isFullScreen = true;
        }
        apply();
    };

    $rootScope.dialogShown = false;
    $rootScope.toggleModal = function() {
        $rootScope.dialogShown = !$rootScope.dialogShown;
    };

    $rootScope.activeTab = 'm';
    $rootScope.changeTab = (name) => {
        $rootScope.activeTab = name;
        if (name == 'c') {
            $rootScope.unReadMessageCount = 0;
        }
    };

    $rootScope.dialpadOpen = false;
    $rootScope.toggleDialpad = ($event) => {
        $rootScope.dialpadOpen = !$rootScope.dialpadOpen;
        $event.stopPropagation();
    };

    $rootScope.fix = $event => $event.stopPropagation();

    $rootScope.dropdownOpened = '';
    $rootScope.openConvasMenu = id => {
        if ($rootScope.dropdownOpened == id) {
            $rootScope.dropdownOpened = '';
            return;
        }
        $rootScope.dropdownOpened = id;
    }
    
});


  app.provider("ngModalDefaults", function() {
    return {
      options: {
        closeButtonHtml: "<span class='ng-modal-close-x'>X</span>"
      },
      $get: function() {
        return this.options;
      },
      set: function(keyOrHash, value) {
        var k, v, _results;
        if (typeof keyOrHash === 'object') {
          _results = [];
          for (k in keyOrHash) {
            v = keyOrHash[k];
            _results.push(this.options[k] = v);
          }
          return _results;
        } else {
          return this.options[keyOrHash] = value;
        }
      }
    };
  });

  app.directive('modalDialog', [
    'ngModalDefaults', '$sce', function(ngModalDefaults, $sce) {
      return {
        restrict: 'E',
        scope: {
          show: '=',
          dialogTitle: '@',
          onClose: '&?'
        },
        replace: true,
        transclude: true,
        link: function(scope, element, attrs) {
          var setupCloseButton, setupStyle;
          setupCloseButton = function() {
            return scope.closeButtonHtml = $sce.trustAsHtml(ngModalDefaults.closeButtonHtml);
          };
          setupStyle = function() {
            scope.dialogStyle = {};
            if (attrs.width) {
              scope.dialogStyle['width'] = attrs.width;
            }
            if (attrs.height) {
              return scope.dialogStyle['height'] = attrs.height;
            }
          };
          scope.hideModal = function() {
            return scope.show = false;
          };
          scope.$watch('show', function(newVal, oldVal) {
            if (newVal && !oldVal) {
              document.getElementsByTagName("body")[0].style.overflow = "hidden";
            } else {
              document.getElementsByTagName("body")[0].style.overflow = "";
            }
            if ((!newVal && oldVal) && (scope.onClose != null)) {
              return scope.onClose();
            }
          });
          setupCloseButton();
          return setupStyle();
        },
        template: "<div class='ng-modal' ng-show='show'>\n  <div class='ng-modal-overlay' ng-click='hideModal()'></div>\n  <div class='ng-modal-dialog' ng-style='dialogStyle'>\n    <span class='ng-modal-title' ng-show='dialogTitle && dialogTitle.length' ng-bind='dialogTitle'></span>\n    <div class='ng-modal-close' ng-click='hideModal()'>\n      <div ng-bind-html='closeButtonHtml'></div>\n    </div>\n    <div class='ng-modal-dialog-content' ng-transclude></div>\n  </div>\n</div>"
      };
    }
  ]);


//Exelent little functions to use any time when class modification is needed
function hasClass(ele, cls) {
    return !!ele.className.match(new RegExp('(\\s|^)' + cls + '(\\s|$)'));
}

function addClass(ele, cls) {
    if (!hasClass(ele, cls)) ele.className += " " + cls;
}

function removeClass(ele, cls) {
    if (hasClass(ele, cls)) {
        var reg = new RegExp('(\\s|^)' + cls + '(\\s|$)');
        ele.className = ele.className.replace(reg, ' ');
    }
}

//Add event from js the keep the marup clean
function initMenu() {
    document.getElementById("menu-toggle").addEventListener("click", toggleMenu);
}

//The actual fuction
function toggleMenu() {
    var ele = document.getElementsByTagName('body')[0];
    if (!hasClass(ele, "open")) {
        addClass(ele, "open");
    } else {
        removeClass(ele, "open");
    }
}

//Prevent the function to run before the document is loaded
document.addEventListener('readystatechange', function() {
    if (document.readyState === "complete") {
        initMenu();
    }
});
