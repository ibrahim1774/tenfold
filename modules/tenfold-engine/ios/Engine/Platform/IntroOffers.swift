import Foundation
import StoreKit

/// Free-trial eligibility from StoreKit 2, so the paywall only promises a trial the App Store will give.
/// Apple gives one introductory offer per subscription group: an Apple ID that has had a trial, or any
/// subscription, in the group isn't eligible again, whatever the product offers. Foundation and StoreKit only,
/// so it type-checks on the Mac.
public enum IntroOffers {
  public struct Eligibility: Codable, Sendable {
    public var productId: String
    /// The product has a free-trial introductory offer and this Apple ID can still get it.
    public var freeTrial: Bool
    /// The trial's length in days, when it is counted in days or weeks.
    public var trialDays: Int?
  }

  /// One entry per subscription product the App Store returned; products it didn't return are left out.
  public static func eligibility(_ productIds: [String]) async throws -> [Eligibility] {
    let products = try await Product.products(for: productIds)
    var result: [Eligibility] = []
    for product in products {
      guard let subscription = product.subscription else { continue }
      var freeTrial = false
      var trialDays: Int?
      if let offer = subscription.introductoryOffer, offer.paymentMode == .freeTrial {
        freeTrial = await subscription.isEligibleForIntroOffer
        trialDays = days(offer.period)
      }
      result.append(Eligibility(productId: product.id, freeTrial: freeTrial, trialDays: trialDays))
    }
    return result
  }

  static func days(_ period: Product.SubscriptionPeriod) -> Int? {
    switch period.unit {
    case .day: return period.value
    case .week: return period.value * 7
    default: return nil
    }
  }
}
