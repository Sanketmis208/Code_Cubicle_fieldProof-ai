import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../core/capture_manifest.dart';
import '../core/geo.dart';
import '../core/models.dart';
import '../services/location_service.dart';
import '../state/app_state.dart';
import '../theme.dart';
import 'submissions_screen.dart';

/// The camera. There is no gallery and no file picker anywhere in the app:
/// evidence can only enter through this shutter. At the shutter the app
/// records GPS (with Android's mock-location flag), trusted time and the
/// file's SHA-256, signs those facts with this phone's key, and queues the
/// capture. The shutter is never blocked by weak GPS; a blocked worker goes
/// back to WhatsApp.
class CaptureScreen extends StatefulWidget {
  const CaptureScreen({super.key, required this.project});

  final CaptureProject project;

  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen> with WidgetsBindingObserver {
  final LocationService _location = LocationService();
  final Uuid _uuid = const Uuid();
  CameraController? _camera;
  String? _cameraError;
  StreamSubscription<Fix>? _gps;
  Fix? _fix;
  bool _gpsUnavailable = false;
  bool _guide = false;
  File? _guidePhoto;
  bool _shooting = false;
  bool _cameraStarting = false;
  int _taken = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _startCamera();
    _startGps();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _gps?.cancel();
    _camera?.dispose();
    super.dispose();
  }

  /// The camera must be released when the app goes to the background.
  @override
  void didChangeAppLifecycleState(AppLifecycleState lifecycle) {
    if (lifecycle == AppLifecycleState.inactive) {
      final camera = _camera;
      if (camera == null) return;
      _camera = null;
      camera.dispose();
      if (mounted) setState(() {});
    } else if (lifecycle == AppLifecycleState.resumed && _camera == null) {
      _startCamera();
    }
  }

  /// Permission dialogs send the app inactive and back while the camera is
  /// still starting; only one start may run, and a start that finishes in the
  /// background releases the camera straight away.
  Future<void> _startCamera() async {
    if (_cameraStarting) return;
    _cameraStarting = true;
    try {
      final cameras = await availableCameras();
      final back = cameras.firstWhere((c) => c.lensDirection == CameraLensDirection.back, orElse: () => cameras.first);
      // 720p keeps each photo a few hundred KB for 2G uploads while staying legible as evidence.
      final controller = CameraController(back, ResolutionPreset.high, enableAudio: false);
      await controller.initialize();
      if (!mounted || WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed) {
        await controller.dispose();
        return;
      }
      setState(() {
        _camera = controller;
        _cameraError = null;
      });
    } on CameraException catch (error) {
      if (!mounted) return;
      setState(() => _cameraError = error.code.contains('AccessDenied')
          ? 'Camera permission was refused. Allow it in the phone settings for FieldProof.'
          : 'The camera could not start (${error.description ?? error.code}).');
    } on StateError {
      if (mounted) setState(() => _cameraError = 'No camera found on this phone.');
    } finally {
      _cameraStarting = false;
    }
  }

  Future<void> _startGps() async {
    final allowed = await _location.ensurePermission();
    if (!mounted) return;
    if (!allowed) {
      setState(() => _gpsUnavailable = true);
      return;
    }
    _gps = _location.watch().listen(
      (fix) {
        if (mounted) setState(() => _fix = fix);
      },
      onError: (Object _) {
        if (mounted) setState(() => _gpsUnavailable = true);
      },
    );
  }

  void _message(String text) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text), behavior: SnackBarBehavior.floating));
  }

  Future<void> _shoot(AppState state) async {
    final camera = _camera;
    if (camera == null || !camera.value.isInitialized || _shooting) return;
    if (!state.device.ready || state.device.deviceId == null) {
      _message('This phone is not set up to sign captures yet. Connect to the internet and pull down on the home screen.');
      return;
    }
    setState(() => _shooting = true);
    try {
      final shot = await camera.takePicture();
      final bytes = await shot.readAsBytes();
      // Facts are read at the shutter, before anything else can change them.
      final fix = _fix;
      final time = state.clock.now();
      final id = _uuid.v4();
      final manifest = CaptureManifest(
        clientCaptureId: id,
        projectId: widget.project.id,
        sha256: sha256.convert(bytes).toString(),
        capturedAt: time.time,
        timeSource: time.source,
        deviceId: state.device.deviceId!,
        latitude: fix?.latitude,
        longitude: fix?.longitude,
        accuracyM: fix?.accuracyM,
        mockLocation: fix?.mocked,
      ).encode();
      final signature = await state.device.sign(utf8.encode(manifest));
      await state.queue.enqueue(
        id: id,
        projectId: widget.project.id,
        projectName: widget.project.name,
        bytes: bytes,
        manifest: manifest,
        signature: signature,
      );
      try {
        await File(shot.path).delete();
      } on FileSystemException {
        // The camera's temp file is cleaned up by the OS anyway.
      }
      unawaited(state.queue.flush(state.api));
      if (!mounted) return;
      setState(() {
        _taken += 1;
        if (_guide) _guidePhoto = state.queue.lastPhoto;
      });
      _message(fix == null ? 'Saved without GPS. Sending when online.' : 'Saved. Sending when online.');
    } on CameraException catch (error) {
      if (mounted) _message('Could not take the photo: ${error.description ?? error.code}');
    } finally {
      if (mounted) setState(() => _shooting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final camera = _camera;
    final fix = _fix;
    final site = fix == null ? null : nearestSite(widget.project.sites, fix.latitude, fix.longitude, fix.accuracyM);
    final guide = _guide ? _guidePhoto : null;
    return Scaffold(
      backgroundColor: Brand.ink,
      appBar: AppBar(
        backgroundColor: Brand.ink,
        foregroundColor: Colors.white,
        title: Text(widget.project.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        actions: [
          TextButton.icon(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const SubmissionsScreen())),
            icon: const Icon(Icons.cloud_upload_outlined, color: Brand.lime),
            label: Text('$_taken taken', style: const TextStyle(color: Colors.white)),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(children: [
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(24),
                child: Stack(fit: StackFit.expand, children: [
                  if (camera != null && camera.value.isInitialized)
                    FittedBox(
                      fit: BoxFit.cover,
                      child: SizedBox(
                        width: camera.value.previewSize?.height ?? 1080,
                        height: camera.value.previewSize?.width ?? 1920,
                        child: CameraPreview(camera),
                      ),
                    )
                  else
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: _cameraError == null
                            ? const CircularProgressIndicator(color: Brand.lime)
                            : Text(_cameraError!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white)),
                      ),
                    ),
                  if (guide != null) Opacity(opacity: 0.35, child: Image.file(guide, fit: BoxFit.cover)),
                  Positioned(
                    left: 12,
                    top: 12,
                    right: 12,
                    child: Wrap(spacing: 8, runSpacing: 8, children: [
                      _Pill(
                        icon: fix == null ? Icons.location_searching : Icons.my_location,
                        text: fix != null
                            ? '±${fix.accuracyM.round()} m'
                            : _gpsUnavailable
                                ? 'No GPS (allowed)'
                                : 'Finding GPS…',
                      ),
                      if (site != null) _Pill(icon: Icons.place, text: site.label, color: site.inside ? const Color(0xFF059669) : const Color(0xFFD97706)),
                      if (fix?.mocked ?? false)
                        const _Pill(icon: Icons.warning_amber, text: 'Mock location detected', color: Color(0xFFB91C1C)),
                      _Pill(
                        icon: Icons.schedule,
                        text: state.clock.isTrusted ? 'FieldProof time' : 'Phone clock (offline)',
                      ),
                    ]),
                  ),
                ]),
              ),
            ),
          ),
          ListenableBuilder(
            listenable: state.queue,
            builder: (context, _) => Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                _RoundAction(
                  icon: Icons.layers_outlined,
                  label: 'Match last',
                  active: _guide,
                  onTap: state.queue.lastPhoto == null
                      ? null
                      : () => setState(() {
                            _guide = !_guide;
                            _guidePhoto = _guide ? state.queue.lastPhoto : null;
                          }),
                ),
                Semantics(
                  button: true,
                  label: 'Take photo',
                  child: GestureDetector(
                    onTap: _shooting ? null : () => _shoot(state),
                    child: Container(
                      width: 84,
                      height: 84,
                      decoration: BoxDecoration(color: Brand.lime, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 5)),
                      child: _shooting
                          ? const Padding(padding: EdgeInsets.all(26), child: CircularProgressIndicator(strokeWidth: 3, color: Brand.ink))
                          : const Icon(Icons.photo_camera, size: 34, color: Brand.ink),
                    ),
                  ),
                ),
                _RoundAction(
                  icon: Icons.inventory_2_outlined,
                  label: '${state.queue.waiting} to send',
                  onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const SubmissionsScreen())),
                ),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.icon, required this.text, this.color});

  final IconData icon;
  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: color ?? Colors.black.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(99)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 14, color: Colors.white),
        const SizedBox(width: 6),
        Text(text, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
      ]),
    );
  }
}

class _RoundAction extends StatelessWidget {
  const _RoundAction({required this.icon, required this.label, this.onTap, this.active = false});

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: SizedBox(
        width: 84,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, color: !enabled ? Colors.white24 : active ? Brand.lime : Colors.white70),
          const SizedBox(height: 4),
          Text(label, textAlign: TextAlign.center, style: TextStyle(color: enabled ? Colors.white70 : Colors.white24, fontSize: 11)),
        ]),
      ),
    );
  }
}
