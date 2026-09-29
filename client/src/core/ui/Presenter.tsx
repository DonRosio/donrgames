import presenterUrl from '../../assets/presenter.png';

/**
 * The host of the round transition, from the transition wireframe: cut out of it, warmed up and
 * softened to match the sunset (see design/wireframes/transition.png). Waist-up: the bottom of
 * the picture is meant to be cropped by the bottom of the screen.
 */
export function Presenter({ className }: { className?: string }) {
  return <img className={className} src={presenterUrl} alt="Le présentateur" draggable={false} />;
}
