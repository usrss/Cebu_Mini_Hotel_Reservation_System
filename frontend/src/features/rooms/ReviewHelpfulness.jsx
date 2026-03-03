import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import './ReviewHelpfulness.css';

/**
 * ReviewHelpfulness Component
 * Displays "Was this review helpful?" with thumbs up/down buttons
 */
export default function ReviewHelpfulness({
  reviewId,
  helpfulCount = 0,
  notHelpfulCount = 0,
  userVote = null,
  onVote
}) {
  const [isVoting, setIsVoting] = useState(false);
  const [localVote, setLocalVote] = useState(userVote);
  const [localHelpful, setLocalHelpful] = useState(helpfulCount);
  const [localNotHelpful, setLocalNotHelpful] = useState(notHelpfulCount);

  const handleVote = async (isHelpful) => {
    if (isVoting) return;

    setIsVoting(true);

    try {
      // If clicking same vote, remove it
      if ((isHelpful && localVote === 'up') || (!isHelpful && localVote === 'down')) {
        await onVote(reviewId, null); // Remove vote

        // Update local state
        if (localVote === 'up') {
          setLocalHelpful(prev => prev - 1);
        } else {
          setLocalNotHelpful(prev => prev - 1);
        }
        setLocalVote(null);
      } else {
        // New vote or changing vote
        const result = await onVote(reviewId, isHelpful);

        // Update local state
        if (result) {
          // If user had previous vote, decrement old count
          if (localVote === 'up') {
            setLocalHelpful(prev => prev - 1);
          } else if (localVote === 'down') {
            setLocalNotHelpful(prev => prev - 1);
          }

          // Increment new count
          if (isHelpful) {
            setLocalHelpful(prev => prev + 1);
            setLocalVote('up');
          } else {
            setLocalNotHelpful(prev => prev + 1);
            setLocalVote('down');
          }
        }
      }
    } catch (error) {
      console.error('Failed to vote:', error);
    } finally {
      setIsVoting(false);
    }
  };

  const totalVotes = localHelpful + localNotHelpful;
  const helpfulPercentage = totalVotes > 0 ? Math.round((localHelpful / totalVotes) * 100) : 0;

  return (
    <div className="review-helpfulness">
      <div className="helpfulness-header">
        <span className="helpfulness-question">Was this review helpful?</span>
        {totalVotes > 0 && (
          <span className="helpfulness-stats">
            {localHelpful} of {totalVotes} found this helpful ({helpfulPercentage}%)
          </span>
        )}
      </div>

      <div className="helpfulness-buttons">
        <button
          onClick={() => handleVote(true)}
          disabled={isVoting}
          className={`helpfulness-btn ${localVote === 'up' ? 'active up' : ''}`}
          title="Thumbs up - This review was helpful"
        >
          <ThumbsUp size={18} />
          <span>Yes</span>
          {localHelpful > 0 && <span className="vote-count">({localHelpful})</span>}
        </button>

        <button
          onClick={() => handleVote(false)}
          disabled={isVoting}
          className={`helpfulness-btn ${localVote === 'down' ? 'active down' : ''}`}
          title="Thumbs down - This review was not helpful"
        >
          <ThumbsDown size={18} />
          <span>No</span>
          {localNotHelpful > 0 && <span className="vote-count">({localNotHelpful})</span>}
        </button>
      </div>

      {localVote && (
        <div className="vote-feedback">
          Thank you for your feedback!
        </div>
      )}
    </div>
  );
}