import ExpoModulesCore

public class TenfoldEngineModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TenfoldEngine")

    Events("onJobProgress", "onJobStateChange", "onModelDownloadProgress")

    // M0 smoke test: proves the local module is linked into the dev client.
    Function("ping") {
      return "pong"
    }

    // Engine functions (pickVideos, ensureSpeechModel, enqueueAnalysis, ...) arrive in M1–M4.

    View(TenfoldPreviewView.self) {
      Prop("projectId") { (view: TenfoldPreviewView, id: String) in
        view.load(projectId: id)
      }
      Prop("playing") { (view: TenfoldPreviewView, playing: Bool) in
        view.setPlaying(playing)
      }
      Events("onTime", "onReady", "onEnd")
    }
  }
}
