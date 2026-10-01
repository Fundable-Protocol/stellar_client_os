| Expiration (startDate + duration)
                     v
Created ------------------------------> Active
   x |                                            |
   | Owner cancellation                          | MarkEnded
   v                                            v
 Canceled <------------------------------ Ended
                                            |
                                            v AdminFinalize
                                            Finalized
