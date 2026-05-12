export interface SecurityVideoSource {
  id: "security_cam_01" | "security_cam_02";
  label: string;
  src: string;
  commonsPage: string;
  width: number;
  height: number;
  durationSeconds: number;
  replayOffsetSeconds: number;
  note: string;
}

export const securityVideoSources: SecurityVideoSource[] = [
  {
    id: "security_cam_01",
    label: "Original Pentagon security camera 1",
    src: "https://upload.wikimedia.org/wikipedia/commons/6/67/Pentagon_Security_Camera_1.ogv",
    commonsPage: "https://commons.wikimedia.org/wiki/File:Pentagon_Security_Camera_1.ogv",
    width: 312,
    height: 212,
    durationSeconds: 191.46,
    replayOffsetSeconds: 116,
    note: "Public-domain U.S. government footage mirrored by Wikimedia Commons. Replay alignment is approximate."
  },
  {
    id: "security_cam_02",
    label: "Original Pentagon security camera 2",
    src: "https://upload.wikimedia.org/wikipedia/commons/5/52/Pentagon_Security_Camera_2.ogv",
    commonsPage: "https://commons.wikimedia.org/wiki/File:Pentagon_Security_Camera_2.ogv",
    width: 312,
    height: 212,
    durationSeconds: 202,
    replayOffsetSeconds: 123,
    note: "Public-domain U.S. government footage mirrored by Wikimedia Commons. Replay alignment is approximate."
  }
];

export function getSecurityVideoSource(cameraMode: string) {
  if (cameraMode === "security_cam_02") {
    return securityVideoSources[1];
  }

  return securityVideoSources[0];
}
